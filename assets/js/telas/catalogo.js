import { h, dinheiro, dinheiroCurto, inteiro, avisar } from '../ui.js';
import * as loja from '../loja.js';
import * as carrinho from '../carrinho.js';
import { painelPedido } from './pedido.js';

const qtdEscolhida = new Map();
let termo = '';

const faixaAtiva = (faixas, q) => faixas.reduce((a, f) => (f.qtd_inicial <= q ? f : a), faixas[0]);

export function telaCatalogo(alvo, departamento = '') {
  const deps = loja.departamentos();
  const total = deps.reduce((s, d) => s + d.produtos, 0);
  const corpoTabela = h('div.area-produtos');
  const lateralPedido = h('aside.lateral-pedido', { 'aria-label': 'Pedido atual' });

  function atualizarPedido() {
    lateralPedido.replaceChildren(painelPedido());
  }
  function listar() {
    const lista = loja.produtos({ departamento, busca: termo });
    corpoTabela.replaceChildren(lista.length
      ? tabelaProdutos(lista, atualizarPedido)
      : h('p.vazio', null, termo.trim() ? `Nenhum produto com "${termo}". Tente outro termo ou limpe a busca.` : 'Nenhum produto neste departamento.'));
  }

  alvo.replaceChildren(
    h('div.grade-catalogo', null,
      h('nav.departamentos', { 'aria-label': 'Departamentos' },
        h('h2.titulo-lateral', null, 'Departamentos'),
        h('a', { href: '#/catalogo', 'aria-current': departamento === '' ? 'page' : null }, 'Todos', h('span.qtd', null, total)),
        deps.map((d) => h('a', { href: `#/catalogo/${d.slug}`, 'aria-current': departamento === d.slug ? 'page' : null }, d.nome, h('span.qtd', null, d.produtos)))),
      h('section.conteudo', null,
        h('div.barra', null,
          h('h1', { tabIndex: -1 }, deps.find((d) => d.slug === departamento)?.nome ?? 'Catálogo'),
          h('label.campo-busca', null,
            h('span', null, 'Buscar produto'),
            h('input', {
              type: 'search', id: 'busca', value: termo, placeholder: 'Nome, código ou marca', autocomplete: 'off',
              oninput: (e) => { termo = e.target.value; listar(); },
            }))),
        h('ol.teste-rapido', { 'aria-label': 'Como testar este sistema' },
          h('li', null, 'Mude a quantidade e veja o preço cair por faixa.'),
          h('li', null, 'Adicione até passar do pedido mínimo e feche o pedido.'),
          h('li', null, h('span', null, 'Veja o resultado no ', h('a', { href: '#/gestor' }, 'painel do gestor'), ' e no ', h('a', { href: '#/sql' }, 'console SQL'), '.'))),
        corpoTabela),
      lateralPedido));
  listar();
  atualizarPedido();
}

function tabelaProdutos(lista, aoAdicionar) {
  return h('table.formulario', null,
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Código'),
      h('th', { scope: 'col' }, 'Produto'),
      h('th.num', { scope: 'col' }, 'Estoque'),
      h('th', { scope: 'col' }, 'Preço por quantidade'),
      h('th', { scope: 'col' }, 'Comprar'))),
    h('tbody', null, lista.map((p) => linhaProduto(p, aoAdicionar))));
}

function linhaProduto(p, aoAdicionar) {
  const q = qtdEscolhida.get(p.id) ?? p.qtd_minima;
  const celulas = p.faixas.map((f) => h('div.faixa', { dados: { inicio: f.qtd_inicial } },
    h('span.faixa-qtd', null, f.qtd_inicial === 1 ? 'Avulso' : `${f.qtd_inicial} ou mais`),
    h('span.faixa-preco', null, dinheiroCurto(f.preco_centavos))));
  const subtotal = h('span.subtotal');
  const entrada = h('input', {
    type: 'number', inputMode: 'numeric', min: p.qtd_minima, step: 1, value: q,
    'aria-label': `Quantidade de ${p.nome}`, dados: { produto: p.codigo },
    oninput: () => pintar(),
  });
  const baixo = p.estoque <= p.estoque_minimo;

  function quantidadeAtual() {
    const v = Number.parseInt(entrada.value, 10);
    return Number.isInteger(v) && v > 0 ? v : 0;
  }
  function pintar() {
    const atual = quantidadeAtual();
    qtdEscolhida.set(p.id, atual || p.qtd_minima);
    const ativa = faixaAtiva(p.faixas, Math.max(atual, 1));
    celulas.forEach((c) => c.classList.toggle('ativa', Number(c.dataset.inicio) === ativa.qtd_inicial));
    subtotal.textContent = atual ? dinheiro(ativa.preco_centavos * atual) : '';
  }
  function passo(delta) {
    entrada.value = Math.max(p.qtd_minima, quantidadeAtual() + delta);
    pintar();
  }
  function adicionar() {
    const atual = quantidadeAtual();
    const noCarrinho = carrinho.conteudo()[p.id] ?? 0;
    if (atual < p.qtd_minima) {
      avisar(`${p.nome}: a quantidade mínima é ${p.qtd_minima}.`, 'erro');
      return;
    }
    if (noCarrinho + atual > p.estoque) {
      avisar(`${p.nome}: só há ${inteiro(p.estoque)} em estoque e você já tem ${inteiro(noCarrinho)} no pedido.`, 'erro');
      return;
    }
    carrinho.somar(p.id, atual);
    avisar(`Adicionado: ${inteiro(atual)} de ${p.nome}.`);
    aoAdicionar();
  }

  const linha = h('tr', { dados: { codigo: p.codigo } },
    h('td.codigo', null, p.codigo),
    h('td.produto', null,
      h('strong', null, p.nome),
      h('span.detalhe', null, `${p.marca}. Vendido por ${p.unidade}.`, p.qtd_minima > 1 ? ` Mínimo de ${p.qtd_minima}.` : '')),
    h(`td.num.estoque${baixo ? '.baixo' : ''}`, { dados: { rotulo: 'Estoque' } },
      h('span.saldo', null, inteiro(p.estoque)), baixo ? h('span.selo-baixo', null, 'Baixo') : null),
    h('td.precos', null, h('div.etiqueta', null, celulas)),
    h('td.comprar', null,
      h('div.passo', null,
        h('button', { type: 'button', 'aria-label': `Diminuir ${p.nome}`, onclick: () => passo(-1) }, '−'),
        entrada,
        h('button', { type: 'button', 'aria-label': `Aumentar ${p.nome}`, onclick: () => passo(1) }, '+')),
      subtotal,
      h('button.botao.botao-adicionar', { type: 'button', onclick: adicionar, disabled: p.estoque < p.qtd_minima }, p.estoque < p.qtd_minima ? 'Sem estoque' : 'Adicionar')));
  pintar();
  return linha;
}

