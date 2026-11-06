// Gera capturas das telas principais. Uso: NODE_PATH=$(npm root -g) node tests/e2e/capturas.cjs PASTA_DE_SAIDA
const path = require('path');
const { chromium, devices } = require('playwright');
const { iniciar } = require('./servidor.cjs');

const saida = process.argv[2];
const raiz = path.resolve(__dirname, '../..');

async function inteira(p, arquivo) {
  // Estica a janela até caber tudo: faixa e abas fixas continuam no rodapé da imagem.
  const v = p.viewportSize();
  const altura = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: v.width, height: altura });
  await p.screenshot({ path: arquivo });
  await p.setViewportSize(v);
}

async function capturar(b, base, nome, opcoes) {
  const ctx = await b.newContext({ ...opcoes, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const f = (n) => path.join(saida, `${nome}-${n}.png`);
  const ir = async (r, s) => { await p.evaluate((x) => { window.location.hash = x; }, r); await p.waitForSelector(s); };
  await p.goto(base);
  await p.waitForSelector('.formulario');
  await p.fill('tr[data-codigo="ALI-001"] input', '12');
  await p.click('tr[data-codigo="ALI-001"] .botao-adicionar');
  await p.fill('tr[data-codigo="ALI-006"] input', '24');
  await p.click('tr[data-codigo="ALI-006"] .botao-adicionar');
  await p.waitForFunction(() => document.getElementById('aviso').hidden, null, { timeout: 8000 });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: f('1-catalogo') });
  await ir('#/pedido', '#fechar-pedido');
  await p.screenshot({ path: f('2-pedido') });
  await p.click('#fechar-pedido');
  await p.waitForSelector('#titulo-pedido');
  await p.waitForFunction(() => document.getElementById('aviso').hidden, null, { timeout: 8000 });
  await inteira(p, f('3-pedido-gravado'));
  await ir('#/gestor', '#barras');
  await inteira(p, f('4-painel-gestor'));
  await p.click('.quadro:has(#barras) .ver-sql');
  await p.waitForSelector('#resultado-resumo');
  await p.screenshot({ path: f('5-console-sql') });
  await p.click('#abrir-como');
  await p.screenshot({ path: f('6-como-funciona') });
  await ctx.close();
}

(async () => {
  const { srv, base } = await iniciar(raiz);
  const b = await chromium.launch();
  await capturar(b, base, 'computador', { viewport: { width: 1366, height: 800 } });
  await capturar(b, base, 'celular', { ...devices['iPhone 13'] });
  await capturar(b, base, 'celular-320', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await b.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
