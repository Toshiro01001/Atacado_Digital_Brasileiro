import { h, dinheiro, inteiro, avisar, tabela, confirmar, baixar, dataHora } from '../ui.js';
import * as loja from '../loja.js';
import * as carrinho from '../carrinho.js';
import { exportarBytes, restaurar, consultasRegistradas } from '../banco.js';
import { seloStatus } from './pedido.js';
import { abrirNoConsole } from './console.js';

/** Abre no console o SQL exato que aquele quadro acabou de usar. */
function verSql(origem) {
  return h('button.botao-texto.ver-sql', {
    type: 'button',
    onclick: () => {
      const c = consultasRegistradas().find((x) => x.origem === origem);
      if (c) abrirNoConsole(c);
    },
  }, 'Ver o comando SQL');
}

const quadro = (titulo, origem, ...corpo) => h('section.quadro', null,
  h('header.quadro-topo', null, h('h2', null, titulo), origem ? verSql(origem) : null),
  corpo);

function campoCsv(v) {
  let t = v === null || v === undefined ? '' : String(v);
  // Evita que planilha execute como fórmula um texto começado por estes caracteres.
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

function exportarCsv() {
  const linhas = loja.pedidosParaCsv();
  const colunas = ['id', 'criado_em', 'cliente', 'status', 'codigo', 'nome', 'quantidade', 'preco_unit_centavos', 'total_centavos'];
  const csv = [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => campoCsv(l[c])).join(';'))].join('\r\n');
  baixar('atacado-pedidos-ficticios.csv', `﻿${csv}`, 'text/csv;charset=utf-8');
}

export function telaGestor(alvo, redesenhar) {
  const fat = loja.painel.faturamento();
  const baixo = loja.painel.estoqueBaixo();
  const pedidos = loja.painel.pedidos();
  const fornecedores = loja.painel.fornecedores();
  const movs = loja.painel.movimentacoes();
  const emAberto = loja.painel.emAberto();
  const totalFat = fat.reduce((s, f) => s + f.faturado_centavos, 0);
  const maior = Math.max(1, ...fat.map((f) => f.faturado_centavos));

  function mudar(id, novo) {
    try {
      loja.mudarStatus(id, novo);
      avisar(`${loja.numeroPedido(id)}: ${loja.STATUS[novo]}.${novo === 'cancelado' ? ' Estoque devolvido.' : ''}`);
    } catch (e) {
      if (!(e instanceof loja.ErroNegocio)) throw e;
      avisar(e.message, 'erro');
    }
    redesenhar();
  }

  alvo.replaceChildren(h('section.pagina.painel', null,
    h('div.barra', null, h('h1', { tabIndex: -1 }, 'Painel do gestor'),
      h('p.nota', null, 'Nesta demonstração o painel fica aberto. Na versão para empresas, só entra quem tem login de gestor.')),
    h('p.intro-tela', null, 'Este é o lado de quem administra a loja: quanto foi vendido, o que está acabando no estoque e em que etapa está cada pedido. Os pedidos que você fechar no catálogo aparecem aqui na hora.'),
    h('dl.numeros', null,
      h('div', null, h('dt', null, 'Total vendido'), h('dd', { id: 'num-faturado' }, dinheiro(totalFat))),
      h('div', null, h('dt', null, 'Pedidos em aberto (novos ou em separação)'), h('dd', { id: 'num-abertos' }, inteiro(emAberto))),
      h(`div${baixo.length ? '.alerta' : ''}`, null, h('dt', null, 'Produtos precisando de reposição'), h('dd', { id: 'num-baixo' }, inteiro(baixo.length)))),

    h('div.painel-grade', null,
      quadro('Faturamento por departamento', 'Gestor: faturamento por departamento',
        h('p.nota', null, 'Quanto cada departamento vendeu, somando os pedidos que não foram cancelados.'),
        h('ul.barras', { id: 'barras' }, fat.map((f) => {
          const barra = h('span.barra-valor');
          barra.style.width = `${Math.max(1, (f.faturado_centavos / maior) * 100)}%`;
          return h('li', { title: `${f.departamento}: ${dinheiro(f.faturado_centavos)} em ${f.pedidos} pedidos, ${inteiro(f.volumes)} volumes` },
            h('span.barra-rotulo', null, f.departamento),
            h('span.barra-trilho', null, barra),
            h('span.barra-numero', null, dinheiro(f.faturado_centavos)));
        }))),

      quadro('Estoque baixo', 'Gestor: estoque baixo',
        h('p.nota', null, 'Produtos que chegaram ao mínimo. Confira a quantidade sugerida e toque em "Dar entrada" para registrar a chegada de mercadoria.'),
        tabela([
          { titulo: 'Produto', valor: (b) => [h('strong', null, b.codigo), ' ', b.nome] },
          { titulo: 'Tem / mínimo', num: true, valor: (b) => `${inteiro(b.quantidade_atual)} / ${inteiro(b.quantidade_minima)}` },
          { titulo: 'Fornecedor', valor: (b) => b.fornecedor ?? 'Sem fornecedor' },
          { titulo: 'Quantidade a repor', valor: (b) => {
            const entrada = h('input.qtd-repor', { type: 'number', inputMode: 'numeric', min: 1, value: b.reposicao_sugerida, 'aria-label': `Quantidade a repor de ${b.nome}` });
            return h('div.repor', null, entrada, h('button.botao.botao-claro', {
              type: 'button', dados: { repor: b.codigo },
              onclick: () => {
                try {
                  const saldo = loja.registrarEntrada(b.id, Number.parseInt(entrada.value, 10));
                  avisar(`${b.codigo}: entrada registrada. Novo saldo: ${inteiro(saldo)}.`);
                  redesenhar();
                } catch (e) {
                  if (!(e instanceof loja.ErroNegocio)) throw e;
                  avisar(e.message, 'erro');
                }
              },
            }, 'Dar entrada'));
          } },
        ], baixo, { vazio: 'Nenhum produto no estoque mínimo.' }))),

    quadro('Pedidos', 'Gestor: pedidos',
      h('p.nota', null, 'Todos os pedidos, de todas as empresas. Use os botões da última coluna para levar o pedido à etapa seguinte. Cancelar devolve os itens ao estoque.'),
      tabela([
        { titulo: 'Pedido', valor: (p) => h('a', { href: `#/pedido/${p.id}` }, loja.numeroPedido(p.id)) },
        { titulo: 'Cliente', valor: (p) => p.cliente },
        { titulo: 'Data', valor: (p) => dataHora(p.criado_em) },
        { titulo: 'Itens', num: true, valor: (p) => p.itens },
        { titulo: 'Total', num: true, valor: (p) => dinheiro(p.total_centavos) },
        { titulo: 'Situação', valor: (p) => seloStatus(p.status) },
        { titulo: 'Próxima etapa', valor: (p) => (loja.PROXIMOS[p.status].length ? h('div.acoes-status', { dados: { pedido: p.id } },
          loja.PROXIMOS[p.status].map((s) => h(`button.botao.${s === 'cancelado' ? 'botao-texto-perigo' : 'botao-claro'}`, {
            type: 'button', dados: { status: s },
            onclick: async () => {
              if (s !== 'cancelado' || await confirmar(`Cancelar ${loja.numeroPedido(p.id)}?`, 'O pedido fica cancelado e o estoque de cada item volta para o saldo.', 'Cancelar pedido')) mudar(p.id, s);
            },
          }, s === 'cancelado' ? 'Cancelar' : `Marcar como ${loja.STATUS[s].toLowerCase()}`))) : 'Encerrado') },
      ], pedidos)),

    quadro('Fornecedores', 'Gestor: fornecedores',
      h('p.nota', null, 'Empresas fictícias que abastecem a loja, com prazos combinados e quanto já foi comprado de cada uma.'),
      tabela([
        { titulo: 'Fornecedor', valor: (f) => [h('strong', null, f.razao_social), h('span.detalhe', null, `${f.codigo}, documento ${f.documento_ficticio}`)] },
        { titulo: 'Cidade', valor: (f) => `${f.cidade}/${f.uf}` },
        { titulo: 'Contato', valor: (f) => f.contato },
        { titulo: 'Produtos', num: true, valor: (f) => f.produtos },
        { titulo: 'Prazo de entrega', num: true, valor: (f) => `${f.prazo_entrega_dias} dias` },
        { titulo: 'Prazo para pagar', num: true, valor: (f) => `${f.prazo_pagamento_dias} dias` },
        { titulo: 'Total comprado', num: true, valor: (f) => dinheiro(f.comprado_centavos) },
      ], fornecedores)),

    quadro('Movimentações de estoque', 'Gestor: movimentações de estoque',
      h('p.nota', null, 'Cada entrada ou saída de mercadoria, com o saldo antes e depois. É o histórico que explica o número do estoque.'),
      tabela([
        { titulo: 'Data', valor: (m) => dataHora(m.criado_em) },
        { titulo: 'Produto', valor: (m) => m.codigo },
        { titulo: 'Tipo', valor: (m) => ({ saida: 'Saída', entrada: 'Entrada', devolucao: 'Devolução', ajuste: 'Ajuste' }[m.tipo] ?? m.tipo) },
        { titulo: 'Quantidade', num: true, valor: (m) => inteiro(m.quantidade) },
        { titulo: 'Saldo (antes e depois)', num: true, valor: (m) => `${inteiro(m.quantidade_anterior)} para ${inteiro(m.quantidade_atual)}` },
        { titulo: 'Documento', valor: (m) => m.documento },
      ], movs)),

    quadro('Dados desta demonstração', null,
      h('p', null, 'Tudo o que você fez fica salvo só neste navegador. Se quiser começar do zero, toque em "Restaurar dados de exemplo". Quem trabalha com dados pode baixar uma cópia: o banco inteiro (arquivo .sqlite, que abre em qualquer programa de SQLite) ou só os pedidos (arquivo .csv, que abre em planilha).'),
      h('div.botoes-dados', null,
        h('button.botao.botao-claro', { type: 'button', id: 'baixar-banco', onclick: () => baixar('atacado-demo-ficticio.sqlite', exportarBytes(), 'application/vnd.sqlite3') }, 'Baixar banco (.sqlite)'),
        h('button.botao.botao-claro', { type: 'button', id: 'baixar-csv', onclick: exportarCsv }, 'Baixar pedidos (.csv)'),
        h('button.botao.botao-texto-perigo', {
          type: 'button', id: 'restaurar',
          onclick: async () => {
            if (await confirmar('Restaurar dados de exemplo?', 'Pedidos feitos e estoque alterado neste navegador serão apagados, e o pedido atual será esvaziado.', 'Restaurar dados')) {
              await restaurar();
              carrinho.esvaziar();
              avisar('Dados de exemplo restaurados.');
              redesenhar();
            }
          },
        }, 'Restaurar dados de exemplo')))));
}
