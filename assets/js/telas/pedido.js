import { h, dinheiro, inteiro, avisar, tabela, dataHora } from '../ui.js';
import * as loja from '../loja.js';
import * as carrinho from '../carrinho.js';
import { consultasRegistradas } from '../banco.js';

let observacao = '';

export function seletorCliente(aoMudar) {
  const lista = loja.clientes();
  if (!carrinho.clienteAtual() || !lista.some((c) => c.id === carrinho.clienteAtual())) {
    carrinho.definirCliente(lista[0].id);
  }
  return h('label.campo-cliente', null,
    h('span', null, 'Comprando como'),
    h('select', {
      id: 'cliente',
      onchange: (e) => { carrinho.definirCliente(Number(e.target.value)); aoMudar?.(); },
    }, lista.map((c) => h('option', { value: c.id, selected: c.id === carrinho.clienteAtual() }, c.razao_social))));
}

function medidorMinimo(resumo) {
  const pct = Math.min(100, Math.round((resumo.total / resumo.minimo) * 100));
  const atingiu = resumo.faltaMinimo === 0;
  const barra = h('div.medidor-barra');
  barra.style.width = `${pct}%`;
  return h(`div.medidor${atingiu ? '.ok' : ''}`, null,
    h('div.medidor-trilho', { role: 'img', 'aria-label': `${pct}% do pedido mínimo` }, barra),
    h('p', null, atingiu
      ? `Pedido mínimo de ${dinheiro(resumo.minimo)} atingido.`
      : `Faltam ${dinheiro(resumo.faltaMinimo)} para o pedido mínimo de ${dinheiro(resumo.minimo)}.`));
}

/** Resumo compacto ao lado do catálogo. */
export function painelPedido() {
  const resumo = loja.resumirCarrinho(carrinho.conteudo());
  if (!resumo.linhas.length) {
    return h('div.pedido-mini', null,
      h('h2', null, 'Pedido atual'),
      h('p.vazio', null, 'Escolha a quantidade em uma linha e toque em Adicionar.'),
      medidorMinimo(resumo));
  }
  return h('div.pedido-mini', null,
    h('h2', null, 'Pedido atual'),
    h('ul.mini-itens', null, resumo.linhas.map((l) => h('li', null,
      h('span.mini-nome', null, `${inteiro(l.quantidade)} de ${l.nome}`),
      h('span.mini-valor', null, dinheiro(l.total_centavos))))),
    h('p.mini-total', null, h('span', null, 'Total'), h('strong', { id: 'mini-total' }, dinheiro(resumo.total))),
    medidorMinimo(resumo),
    h('a.botao', { href: '#/pedido' }, 'Revisar pedido'));
}

export function telaPedido(alvo, redesenhar) {
  const resumo = loja.resumirCarrinho(carrinho.conteudo());
  const bloqueio = !resumo.linhas.length ? 'Adicione itens pelo catálogo.'
    : resumo.temProblema ? 'Corrija os itens marcados.'
      : resumo.faltaMinimo > 0 ? 'Complete o pedido mínimo.' : null;

  function fechar() {
    try {
      const id = loja.fecharPedido({
        clienteId: carrinho.clienteAtual(), carrinho: carrinho.conteudo(), observacao,
      });
      observacao = '';
      carrinho.esvaziar();
      avisar(`Pedido ${loja.numeroPedido(id)} gravado.`);
      window.location.hash = `#/pedido/${id}/novo`;
    } catch (erro) {
      if (!(erro instanceof loja.ErroNegocio)) throw erro;
      avisar(`${erro.message} Nada foi gravado.`, 'erro');
      redesenhar();
    }
  }

  alvo.replaceChildren(h('section.pagina', null,
    h('div.barra', null, h('h1', { tabIndex: -1 }, 'Pedido atual'), seletorCliente()),
    !resumo.linhas.length
      ? h('p.vazio', null, 'O pedido está vazio. ', h('a', { href: '#/catalogo' }, 'Abrir o catálogo'))
      : h('div.grade-pedido', null,
        h('div', null, tabela([
          { titulo: 'Produto', valor: (l) => [h('strong', null, l.nome), l.problema ? h('span.problema', null, l.problema) : null,
            l.proxima ? h('span.dica', null, `Com ${inteiro(l.proxima.qtd_inicial)} ou mais, cai para ${dinheiro(l.proxima.preco_centavos)} a unidade.`) : null] },
          { titulo: 'Quantidade', valor: (l) => h('input.qtd-pedido', {
            type: 'number', inputMode: 'numeric', min: 1, value: l.quantidade, 'aria-label': `Quantidade de ${l.nome}`, dados: { produto: l.codigo },
            onchange: (e) => { const v = Number.parseInt(e.target.value, 10); carrinho.definir(l.id, Number.isInteger(v) ? v : 0); redesenhar(); },
          }) },
          { titulo: 'Preço unitário', num: true, valor: (l) => dinheiro(l.preco_centavos) },
          { titulo: 'Total', num: true, valor: (l) => h('strong', null, dinheiro(l.total_centavos)) },
          { titulo: 'Remover', valor: (l) => h('button.botao-texto', { type: 'button', onclick: () => { carrinho.definir(l.id, 0); redesenhar(); } }, `Remover ${l.codigo}`) },
        ], resumo.linhas)),
        h('aside.fechamento', null,
          h('p.total-grande', null, h('span', null, 'Total do pedido'), h('strong', { id: 'total-pedido' }, dinheiro(resumo.total))),
          medidorMinimo(resumo),
          h('label.campo', null, h('span', null, 'Observação (opcional)'),
            h('textarea', { rows: 2, maxLength: 500, value: observacao, oninput: (e) => { observacao = e.target.value; } })),
          h('button.botao.botao-principal', { type: 'button', id: 'fechar-pedido', disabled: Boolean(bloqueio), onclick: fechar }, 'Fechar pedido'),
          bloqueio ? h('p.nota', null, bloqueio) : null,
          h('p.nota', null, 'Demonstração: nenhum pagamento é cobrado.')))));
}

export function telaHistorico(alvo, redesenhar) {
  const seletor = seletorCliente(redesenhar);
  const lista = loja.pedidosDoCliente(carrinho.clienteAtual());
  alvo.replaceChildren(h('section.pagina', null,
    h('div.barra', null, h('h1', { tabIndex: -1 }, 'Histórico de pedidos'), seletor),
    tabela([
      { titulo: 'Pedido', valor: (p) => h('a', { href: `#/pedido/${p.id}` }, loja.numeroPedido(p.id)) },
      { titulo: 'Data', valor: (p) => dataHora(p.criado_em) },
      { titulo: 'Situação', valor: (p) => seloStatus(p.status) },
      { titulo: 'Itens', num: true, valor: (p) => p.itens },
      { titulo: 'Total', num: true, valor: (p) => dinheiro(p.total_centavos) },
    ], lista, { vazio: 'Este cliente ainda não tem pedidos. Feche um pelo catálogo.' })));
}

export const seloStatus = (s) => h(`span.status.status-${s}`, null, loja.STATUS[s] ?? s);

export function telaDetalhePedido(alvo, id, recemCriado) {
  const p = loja.pedido(id);
  if (!p) {
    alvo.replaceChildren(h('section.pagina', null, h('h1', { tabIndex: -1 }, 'Pedido não encontrado'),
      h('p.vazio', null, 'Ele pode ter sumido ao restaurar os dados. ', h('a', { href: '#/historico' }, 'Ver o histórico'))));
    return;
  }
  const comandos = recemCriado ? consultasRegistradas().filter((c) => c.origem === 'Fechar pedido').slice().reverse() : [];
  alvo.replaceChildren(h('section.pagina', null,
    h('div.barra', null, h('h1', { tabIndex: -1, id: 'titulo-pedido' }, loja.numeroPedido(p.id)), seloStatus(p.status)),
    h('p.linha-info', null, `${p.cliente}. Feito em ${dataHora(p.criado_em)}.`),
    p.observacao ? h('p.linha-info', null, `Observação: ${p.observacao}`) : null,
    tabela([
      { titulo: 'Código', valor: (l) => l.codigo },
      { titulo: 'Produto', valor: (l) => l.nome },
      { titulo: 'Quantidade', num: true, valor: (l) => inteiro(l.quantidade) },
      { titulo: 'Preço unitário', num: true, valor: (l) => dinheiro(l.preco_unit_centavos) },
      { titulo: 'Total', num: true, valor: (l) => dinheiro(l.total_centavos) },
    ], p.linhas),
    h('p.total-grande', null, h('span', null, 'Total'), h('strong', { id: 'total-gravado' }, dinheiro(p.total_centavos))),
    comandos.length ? h('section.transacao', null,
      h('h2', null, 'O que acabou de acontecer no banco'),
      h('p', null, 'Estes comandos rodaram como uma só transação. Se um deles falhasse, todos seriam desfeitos.'),
      h('ol.lista-comandos', null, comandos.map((c) => h('li', null,
        h('code', null, c.sql),
        c.vezes > 1 ? h('span.nota', null, `Repetido ${c.vezes} vezes, uma para cada item.`) : null)))) : null,
    h('p', null, h('a', { href: '#/catalogo' }, 'Voltar ao catálogo'))));
}
