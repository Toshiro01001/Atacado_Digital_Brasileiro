// Testes de ponta a ponta da camada do navegador, em três tamanhos de tela.
// Uso: NODE_PATH=$(npm root -g) node tests/e2e/fluxos.cjs
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');
const { iniciar } = require('./servidor.cjs');

const raiz = path.resolve(__dirname, '../..');
let ok = 0;
let falhas = 0;
function t(nome, cond, info) {
  if (cond) { ok++; console.log(`  ok    ${nome}`); } else { falhas++; console.log(`  FALHA ${nome}${info !== undefined ? ` :: ${JSON.stringify(info)}` : ''}`); }
}

const TELAS = [
  ['computador 1366x800', { viewport: { width: 1366, height: 800 } }],
  ['iPhone 13', { ...devices['iPhone 13'] }],
  ['celular 320px', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }],
];

const irPara = async (p, base, rota, seletor) => {
  await p.evaluate((r) => { window.location.hash = r; }, rota);
  await p.waitForSelector(seletor);
};
const estoqueDe = (p, cod) => p.$eval(`tr[data-codigo="${cod}"] .saldo`, (e) => Number(e.textContent.replace(/\D/g, '')));
const semRolagem = async (p, onde) => {
  const r = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth, b: document.body.scrollWidth }));
  t(`sem rolagem horizontal: ${onde}`, r.s <= r.c && r.b <= r.c, r);
};

async function fluxo(navegador, base, nome, opcoes) {
  console.log(`\n== ${nome}`);
  const ctx = await navegador.newContext({ ...opcoes, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = [];
  const externos = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) erros.push(m.text()); });
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('dialog', (d) => { erros.push(`dialog inesperado: ${d.message()}`); d.dismiss(); });
  p.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) externos.push(r.url()); });

  // Abertura
  await p.goto(base);
  await p.waitForSelector('.formulario');
  t('abre com 24 produtos', (await p.$$('.formulario tbody tr')).length === 24);
  await semRolagem(p, 'catálogo');
  t('rótulo Sistema de demonstração visível', await p.isVisible('.marca-selo'));
  t('rodapé com link da Mil e Uma Linhas!', (await p.$eval('.rodape a', (a) => a.href)).startsWith('https://mileumalinhas.com.br'));
  t('rodapé diz Demonstração feita por', (await p.textContent('.rodape')).includes('Demonstração feita por Mil e Uma Linhas!'));
  await p.click('#abrir-como');
  t('Como isto funciona abre', await p.isVisible('#dialogo-como'));
  await semRolagem(p, 'Como isto funciona');
  await p.click('#dialogo-como button[type=submit]');
  t('Como isto funciona fecha', !(await p.isVisible('#dialogo-como')));

  // Filtros
  await p.click('.departamentos a[href="#/catalogo/limpeza"]');
  await p.waitForFunction(() => document.querySelectorAll('.formulario tbody tr').length === 6);
  t('filtra por departamento', true);
  await p.click('.departamentos a[href="#/catalogo"]');
  await p.waitForFunction(() => document.querySelectorAll('.formulario tbody tr').length === 24);
  await p.fill('#busca', 'ACUCAR');
  await p.waitForFunction(() => document.querySelectorAll('.formulario tbody tr').length === 1);
  t('busca ignora acento e caixa', (await p.textContent('.formulario tbody')).includes('Açúcar'));
  await p.fill('#busca', "x'; DROP TABLE produtos; --");
  await p.waitForSelector('.area-produtos .vazio');
  t('injeção na busca não acha nada', true);
  await p.fill('#busca', '');
  await p.waitForFunction(() => document.querySelectorAll('.formulario tbody tr').length === 24);
  t('catálogo intacto depois da injeção', true);

  // Preço por faixa
  const linha = 'tr[data-codigo="ALI-001"]';
  await p.fill(`${linha} input`, '12');
  t('12 unidades ativam a faixa 10 ou mais', (await p.textContent(`${linha} .faixa.ativa .faixa-qtd`)) === '10 ou mais');
  t('subtotal usa o preço da faixa', (await p.textContent(`${linha} .subtotal`)).replace(/\s/g, ' ') === 'R$ 517,20', await p.textContent(`${linha} .subtotal`));
  await p.fill(`${linha} input`, '2');
  t('2 unidades voltam para o avulso', (await p.textContent(`${linha} .faixa.ativa .faixa-qtd`)) === 'Avulso');
  await p.fill(`${linha} input`, '1');
  await p.click(`${linha} .botao-adicionar`);
  t('abaixo do mínimo do produto é recusado', (await p.textContent('#aviso')).includes('quantidade mínima'));
  await p.fill(`${linha} input`, '99999');
  await p.click(`${linha} .botao-adicionar`);
  t('acima do estoque é recusado', (await p.textContent('#aviso')).includes('em estoque'));

  // Pedido mínimo
  await p.fill(`${linha} input`, '2');
  await p.click(`${linha} .botao-adicionar`);
  t('contador do carrinho mostra 1 item', (await p.textContent('#contador-carrinho')) === '1');
  await irPara(p, base, '#/pedido', '#fechar-pedido');
  t('abaixo do pedido mínimo não fecha', await p.isDisabled('#fechar-pedido'));
  await semRolagem(p, 'pedido');

  // Comprar de verdade
  await p.fill('input[data-produto="ALI-001"]', '12');
  await p.keyboard.press('Tab');
  await p.waitForFunction(() => !document.querySelector('#fechar-pedido').disabled);
  t('total do carrinho recalculado pelo banco', (await p.textContent('#total-pedido')).replace(/\s/g, ' ') === 'R$ 517,20');
  await p.fill('.fechamento textarea', '<img src=x onerror="window.__xss=1">Entregar pela manhã');
  await p.dispatchEvent('.fechamento textarea', 'input');
  await p.click('#fechar-pedido');
  await p.waitForSelector('#titulo-pedido');
  const numero = await p.textContent('#titulo-pedido');
  t('pedido gravado com número', /^PED-0000\d\d$/.test(numero), numero);
  t('total gravado confere', (await p.textContent('#total-gravado')).replace(/\s/g, ' ') === 'R$ 517,20');
  t('observação aparece como texto, sem virar HTML', (await p.textContent('#tela')).includes('<img src=x') && !(await p.$('#tela img')) && !(await p.evaluate(() => window.__xss)));
  const cmds = await p.$$eval('.lista-comandos code', (e) => e.map((x) => x.textContent));
  t('tela mostra a transação real', cmds[0] === 'BEGIN IMMEDIATE' && cmds.at(-1) === 'COMMIT' && cmds.some((c) => c.startsWith('UPDATE estoque')), cmds);
  await semRolagem(p, 'pedido gravado');
  t('carrinho esvaziou', await p.isHidden('#contador-carrinho'));

  // Baixa de estoque
  await irPara(p, base, '#/catalogo', '.formulario');
  t('estoque baixou de 160 para 148', (await estoqueDe(p, 'ALI-001')) === 148, await estoqueDe(p, 'ALI-001'));

  // Rollback: um item ruim desfaz o pedido inteiro
  const r = await p.evaluate(async (urlLoja) => {
    const loja = await import(urlLoja);
    const banco = await import(urlLoja.replace('loja.js', 'banco.js'));
    const conta = () => banco.consultarUm('SELECT COUNT(*) AS n FROM pedidos', [], 'teste').n;
    const saldo = (id) => banco.consultarUm('SELECT quantidade_atual AS q FROM estoque WHERE produto_id = ?', [id], 'teste').q;
    const antes = { pedidos: conta(), a: saldo(1), b: saldo(2) };
    let erro = null;
    try { loja.fecharPedido({ clienteId: 1, carrinho: { 1: 5, 2: 99999 } }); } catch (e) { erro = e.codigo; }
    const depois = { pedidos: conta(), a: saldo(1), b: saldo(2) };
    let erroMin = null;
    try { loja.fecharPedido({ clienteId: 1, carrinho: { 1: 2 } }); } catch (e) { erroMin = e.codigo; }
    const fim = { pedidos: conta(), a: saldo(1) };
    return { antes, depois, erro, erroMin, fim };
  }, `${base}assets/js/loja.js`);
  t('falha em um item desfaz o pedido inteiro', r.erro === 'estoque' && JSON.stringify(r.antes) === JSON.stringify(r.depois), r);
  t('abaixo do mínimo também desfaz', r.erroMin === 'minimo_pedido' && r.fim.pedidos === r.antes.pedidos && r.fim.a === r.antes.a, r);

  // Persistência
  await p.reload();
  await p.waitForSelector('.formulario');
  t('depois de recarregar, estoque continua 148', (await estoqueDe(p, 'ALI-001')) === 148);
  await irPara(p, base, '#/historico', '.lista');
  t('depois de recarregar, o pedido está no histórico', (await p.textContent('#tela')).includes(numero));
  await semRolagem(p, 'histórico');

  // Painel do gestor
  await irPara(p, base, '#/gestor', '#barras');
  await semRolagem(p, 'gestor');
  t('faturamento inclui o pedido novo', (await p.textContent('#num-faturado')).replace(/\s/g, ' ') === 'R$ 23.699,50', await p.textContent('#num-faturado'));
  t('quatro departamentos no gráfico', (await p.$$('#barras li')).length === 4);
  t('quatro produtos no estoque mínimo', (await p.textContent('#num-baixo')) === '4');
  t('cinco fornecedores', (await p.textContent('#tela')).includes('Cooperativa Fictícia Épsilon'));
  await p.click('button[data-repor="ESC-005"]');
  await p.waitForFunction(() => document.querySelector('#num-baixo').textContent === '3');
  t('dar entrada tira o produto da lista de estoque baixo', !(await p.$('button[data-repor="ESC-005"]')));
  const idPed = Number(numero.slice(4));
  await p.click(`.acoes-status[data-pedido="${idPed}"] button[data-status="separacao"]`);
  await p.waitForSelector(`.acoes-status[data-pedido="${idPed}"] button[data-status="faturado"]`);
  t('pedido avança de etapa', true);
  await p.click(`.acoes-status[data-pedido="${idPed}"] button[data-status="cancelado"]`);
  await p.click('#confirmar-sim');
  await p.waitForFunction((id) => !document.querySelector(`.acoes-status[data-pedido="${id}"]`), idPed);
  await irPara(p, base, '#/catalogo', '.formulario');
  t('cancelar devolve o estoque', (await estoqueDe(p, 'ALI-001')) === 160, await estoqueDe(p, 'ALI-001'));

  // Exportar
  await irPara(p, base, '#/gestor', '#barras');
  const [dl1] = await Promise.all([p.waitForEvent('download'), p.click('#baixar-banco')]);
  const cab = fs.readFileSync(await dl1.path()).subarray(0, 15).toString();
  t('banco exportado é um SQLite de verdade', cab === 'SQLite format 3', cab);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#baixar-csv')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  t('CSV traz os pedidos com acentos', csv.includes('Mercadinho Fictício') && csv.split('\r\n').length > 30);

  // Ver SQL e console
  await p.click('.quadro:has(#barras) .ver-sql');
  await p.waitForSelector('#resultado-resumo');
  t('Ver SQL abre o console com a consulta da tela', (await p.inputValue('#editor-sql')).includes('vw_faturamento_departamento'));
  await semRolagem(p, 'console');
  t('console lista o que as telas executaram', (await p.$$('#lista-consultas li')).length > 5);
  const tenta = async (sql) => {
    await p.fill('#editor-sql', sql);
    await p.click('#executar-sql');
    await p.waitForFunction(() => document.querySelector('#resultado').children.length > 0);
    return p.textContent('#resultado');
  };
  t('SELECT funciona', (await tenta('SELECT COUNT(*) AS n FROM produtos')).includes('24'));
  for (const ruim of [
    'DROP TABLE produtos', 'DELETE FROM estoque', "UPDATE estoque SET quantidade_atual = 0", 'SELECT 1; DROP TABLE produtos',
    'WITH x AS (SELECT 1) DELETE FROM produtos', '/* c */ DELETE FROM produtos', 'PRAGMA query_only = OFF', "ATTACH DATABASE 'x' AS y",
    'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT COUNT(*) FROM c',
  ]) {
    await p.evaluate(() => document.querySelector('#resultado').replaceChildren());
    const saida = await tenta(ruim);
    t(`console recusa: ${ruim.slice(0, 40)}`, /só de leitura|um comando por vez|recusou|recursivas/i.test(saida), saida);
  }
  await p.evaluate(() => document.querySelector('#resultado').replaceChildren());
  t('nada mudou depois das tentativas', (await tenta('SELECT (SELECT COUNT(*) FROM produtos) || \'/\' || (SELECT SUM(quantidade_atual > 0) FROM estoque) AS r')).includes('24/24'));
  await p.evaluate(() => document.querySelector('#resultado').replaceChildren());
  const tudo = await tenta('SELECT * FROM movimentacoes_estoque');
  t('resultado largo não gera rolagem da página', tudo.includes('Venda ao cliente'));
  await semRolagem(p, 'console com tabela larga');

  // Faixa de SQL no rodapé
  await p.click('#fita-sql');
  t('faixa de SQL abre o console', (await p.evaluate(() => window.location.hash)) === '#/sql');

  // Restaurar
  await irPara(p, base, '#/catalogo', '.formulario');
  await p.fill(`${linha} input`, '20');
  await p.click(`${linha} .botao-adicionar`);
  await irPara(p, base, '#/gestor', '#barras');
  await p.click('#restaurar');
  await p.click('#confirmar-sim');
  await p.waitForFunction(() => document.querySelector('#num-baixo').textContent === '4');
  t('restaurar volta os indicadores', (await p.textContent('#num-faturado')).replace(/\s/g, ' ') === 'R$ 23.182,30', await p.textContent('#num-faturado'));
  t('restaurar esvazia o carrinho', await p.isHidden('#contador-carrinho'));
  await p.reload();
  await p.waitForSelector('#barras');
  await irPara(p, base, '#/catalogo', '.formulario');
  t('restauração persiste depois de recarregar', (await estoqueDe(p, 'ALI-001')) === 160);

  // Duas abas
  if (nome.startsWith('computador')) {
    const p2 = await ctx.newPage();
    await p2.goto(base);
    await p2.waitForSelector('.formulario');
    await p.fill(`${linha} input`, '12');
    await p.click(`${linha} .botao-adicionar`);
    await irPara(p, base, '#/pedido', '#fechar-pedido');
    await p.click('#fechar-pedido');
    await p.waitForSelector('#titulo-pedido');
    await p2.waitForFunction(() => document.querySelector('tr[data-codigo="ALI-001"] .saldo').textContent === '148');
    t('segunda aba enxerga o estoque novo', true);
    await p2.close();
  }

  t('nenhum recurso externo carregado', externos.length === 0, externos);
  t('nenhum erro no console', erros.length === 0, erros);
  await ctx.close();
}

(async () => {
  const { srv, base } = await iniciar(raiz);
  const navegador = await chromium.launch();
  for (const [nome, opcoes] of TELAS) await fluxo(navegador, base, nome, opcoes);

  // Sem armazenamento: a página precisa funcionar mesmo assim
  console.log('\n== IndexedDB bloqueado');
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('bloqueado'); } });
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(base);
  await p.waitForSelector('.formulario');
  t('abre sem armazenamento', (await p.$$('.formulario tbody tr')).length === 24);
  t('avisa que os dados valem só nesta aba', (await p.textContent('#estado-salvamento')).includes('bloqueou'));
  t('sem exceção não tratada', erros.length === 0, erros);
  await ctx.close();

  await navegador.close();
  srv.close();
  console.log(`\nResultado: ${ok} ok, ${falhas} falhas`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
