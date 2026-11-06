// Regras do negócio no navegador. Todo o SQL das telas está aqui, sempre com parâmetros.
// As regras são as mesmas de server/src/Pedidos.php, e as tabelas são as mesmas de sql/.
import { consultar, consultarUm, executar, transacao, ultimoId } from './banco.js';

export class ErroNegocio extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export const STATUS = {
  novo: 'Novo',
  separacao: 'Em separação',
  faturado: 'Faturado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const PROXIMOS = {
  novo: ['separacao', 'cancelado'],
  separacao: ['faturado', 'cancelado'],
  faturado: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
};

const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
export const numeroPedido = (id) => `PED-${String(id).padStart(6, '0')}`;

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const padraoBusca = (t) => normalizar(t.trim()).replace(/[!%_]/g, (c) => `!${c}`);

// ---- Catálogo ----
export function departamentos() {
  return consultar(
    `SELECT d.slug, d.nome, COUNT(v.id) AS produtos
     FROM departamentos d LEFT JOIN vw_catalogo v ON v.departamento_slug = d.slug
     WHERE d.ativo = 1 GROUP BY d.id, d.slug, d.nome ORDER BY d.id`,
    [], 'Catálogo: departamentos',
  );
}

export function produtos({ departamento = '', busca = '' } = {}) {
  const onde = [];
  const params = [];
  if (departamento) {
    onde.push('departamento_slug = ?');
    params.push(departamento);
  }
  if (busca.trim()) {
    onde.push("busca LIKE ? ESCAPE '!'");
    params.push(`%${padraoBusca(busca)}%`);
  }
  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const lista = consultar(
    `SELECT id, codigo, nome, descricao, marca, unidade, qtd_minima, departamento, estoque, estoque_minimo
     FROM vw_catalogo ${where} ORDER BY codigo`,
    params, 'Catálogo: produtos',
  );
  const faixas = consultar(
    'SELECT produto_id, qtd_inicial, preco_centavos FROM faixas_preco ORDER BY produto_id, qtd_inicial',
    [], 'Catálogo: faixas de preço',
  );
  const porProduto = new Map();
  faixas.forEach((f) => {
    if (!porProduto.has(f.produto_id)) porProduto.set(f.produto_id, []);
    porProduto.get(f.produto_id).push(f);
  });
  return lista.map((p) => ({ ...p, faixas: porProduto.get(p.id) ?? [] }));
}

export const clientes = () => consultar(
  'SELECT id, razao_social, documento_ficticio, cidade, uf FROM clientes WHERE ativo = 1 ORDER BY razao_social',
  [], 'Clientes',
);

export function pedidoMinimo() {
  return Number(consultarUm(
    "SELECT valor FROM configuracoes WHERE chave = 'pedido_minimo_centavos'",
    [], 'Pedido: valor mínimo',
  ).valor);
}

function precoVigente(produtoId, quantidade, origem) {
  return consultarUm(
    'SELECT preco_centavos FROM faixas_preco WHERE produto_id = ? AND qtd_inicial <= ? ORDER BY qtd_inicial DESC LIMIT 1',
    [produtoId, quantidade], origem,
  )?.preco_centavos ?? null;
}

// ---- Carrinho: preços sempre vêm do banco, nunca da tela ----
export function resumirCarrinho(carrinho) {
  const origem = 'Pedido: calcular carrinho';
  const linhas = [];
  Object.entries(carrinho).forEach(([id, quantidade]) => {
    const p = consultarUm(
      'SELECT id, codigo, nome, unidade, qtd_minima, estoque FROM vw_catalogo WHERE id = ?',
      [Number(id)], origem,
    );
    if (!p) return;
    const preco = precoVigente(p.id, quantidade, origem);
    const proxima = consultarUm(
      'SELECT qtd_inicial, preco_centavos FROM faixas_preco WHERE produto_id = ? AND qtd_inicial > ? ORDER BY qtd_inicial LIMIT 1',
      [p.id, quantidade], origem,
    );
    linhas.push({
      ...p,
      quantidade,
      preco_centavos: preco,
      total_centavos: preco * quantidade,
      proxima,
      problema: quantidade > p.estoque ? `Só há ${p.estoque} em estoque.`
        : quantidade < p.qtd_minima ? `Quantidade mínima: ${p.qtd_minima}.` : null,
    });
  });
  const total = linhas.reduce((s, l) => s + l.total_centavos, 0);
  const minimo = pedidoMinimo();
  return { linhas, total, minimo, faltaMinimo: Math.max(0, minimo - total), temProblema: linhas.some((l) => l.problema) };
}

// ---- Fechar pedido: mesma sequência da API em PHP ----
export function fecharPedido({ clienteId, carrinho, observacao = '' }) {
  const origem = 'Fechar pedido';
  const ids = Object.keys(carrinho).map(Number).sort((a, b) => a - b);
  if (!ids.length) throw new ErroNegocio('vazio', 'O pedido está vazio. Adicione itens pelo catálogo.');
  return transacao(origem, () => {
    executar(
      'INSERT INTO pedidos (cliente_id, observacao, criado_em) VALUES (?, ?, ?)',
      [clienteId, observacao.trim() || null, agora()], origem,
    );
    const pedidoId = ultimoId();
    let total = 0;
    ids.forEach((id) => {
      const quantidade = carrinho[id];
      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        throw new ErroNegocio('quantidade', 'Quantidade inválida no pedido.');
      }
      const p = consultarUm('SELECT id, nome, qtd_minima FROM vw_catalogo WHERE id = ?', [id], origem);
      if (!p) throw new ErroNegocio('produto', 'Um dos produtos não existe mais.');
      if (quantidade < p.qtd_minima) throw new ErroNegocio('minimo_item', `${p.nome}: a quantidade mínima é ${p.qtd_minima}.`);
      const preco = precoVigente(id, quantidade, origem);
      // Baixa condicional: só desconta se ainda houver saldo.
      const baixou = executar(
        'UPDATE estoque SET quantidade_atual = quantidade_atual - ? WHERE produto_id = ? AND quantidade_atual >= ?',
        [quantidade, id, quantidade], origem,
      );
      if (baixou !== 1) throw new ErroNegocio('estoque', `${p.nome}: estoque insuficiente para ${quantidade}.`);
      const saldo = consultarUm('SELECT quantidade_atual FROM estoque WHERE produto_id = ?', [id], origem).quantidade_atual;
      const linha = preco * quantidade;
      total += linha;
      executar(
        'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unit_centavos, total_centavos) VALUES (?, ?, ?, ?, ?)',
        [pedidoId, id, quantidade, preco, linha], origem,
      );
      movimentar(id, 'saida', quantidade, saldo + quantidade, saldo, 'Venda ao cliente', numeroPedido(pedidoId), 'navegador', origem);
    });
    const minimo = pedidoMinimo();
    if (total < minimo) throw new ErroNegocio('minimo_pedido', 'O pedido não atingiu o valor mínimo.');
    executar('UPDATE pedidos SET total_centavos = ? WHERE id = ?', [total, pedidoId], origem);
    return pedidoId;
  });
}

function movimentar(produtoId, tipo, quantidade, anterior, atual, motivo, documento, responsavel, origem) {
  executar(
    `INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, quantidade_anterior, quantidade_atual, motivo, documento, responsavel, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [produtoId, tipo, quantidade, anterior, atual, motivo, documento, responsavel, agora()], origem,
  );
}

// ---- Pedidos ----
export const pedidosDoCliente = (clienteId) => consultar(
  'SELECT id, status, total_centavos, criado_em, itens FROM vw_pedidos_resumo WHERE cliente_id = ? ORDER BY id DESC',
  [clienteId], 'Histórico: pedidos do cliente',
);

export function pedido(id) {
  const origem = 'Pedido: detalhe';
  const cabecalho = consultarUm(
    'SELECT id, cliente, status, total_centavos, observacao, criado_em FROM vw_pedidos_resumo WHERE id = ?',
    [id], origem,
  );
  if (!cabecalho) return null;
  const linhas = consultar(
    `SELECT p.codigo, p.nome, p.unidade, i.quantidade, i.preco_unit_centavos, i.total_centavos
     FROM pedido_itens i JOIN produtos p ON p.id = i.produto_id WHERE i.pedido_id = ? ORDER BY p.codigo`,
    [id], origem,
  );
  return { ...cabecalho, linhas };
}

export function mudarStatus(id, novo) {
  const origem = 'Gestor: mudar status';
  return transacao(origem, () => {
    const atual = consultarUm('SELECT status FROM pedidos WHERE id = ?', [id], origem);
    if (!atual || !PROXIMOS[atual.status]?.includes(novo)) {
      throw new ErroNegocio('transicao', 'Este pedido não pode ir para essa etapa.');
    }
    executar('UPDATE pedidos SET status = ? WHERE id = ? AND status = ?', [novo, id, atual.status], origem);
    if (novo === 'cancelado') {
      consultar('SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = ? ORDER BY produto_id', [id], origem)
        .forEach((i) => repor(i.produto_id, i.quantidade, 'devolucao', 'Pedido cancelado', numeroPedido(id), origem));
    }
  });
}

function repor(produtoId, quantidade, tipo, motivo, documento, origem) {
  executar('UPDATE estoque SET quantidade_atual = quantidade_atual + ? WHERE produto_id = ?', [quantidade, produtoId], origem);
  const saldo = consultarUm('SELECT quantidade_atual FROM estoque WHERE produto_id = ?', [produtoId], origem).quantidade_atual;
  movimentar(produtoId, tipo, quantidade, saldo - quantidade, saldo, motivo, documento, 'gestor', origem);
  return saldo;
}

export function registrarEntrada(produtoId, quantidade) {
  const origem = 'Gestor: registrar entrada';
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw new ErroNegocio('quantidade', 'Informe uma quantidade inteira e positiva.');
  return transacao(origem, () => {
    const fp = consultarUm(
      'SELECT fornecedor_id, preco_compra_centavos FROM fornecedor_produtos WHERE produto_id = ? ORDER BY preco_compra_centavos, fornecedor_id LIMIT 1',
      [produtoId], origem,
    );
    if (!fp) throw new ErroNegocio('fornecedor', 'Produto sem fornecedor cadastrado.');
    executar(
      'INSERT INTO compras_fornecedor (fornecedor_id, produto_id, quantidade, total_centavos, criado_em) VALUES (?, ?, ?, ?, ?)',
      [fp.fornecedor_id, produtoId, quantidade, quantidade * fp.preco_compra_centavos, agora()], origem,
    );
    return repor(produtoId, quantidade, 'entrada', 'Reposição do fornecedor', `COMPRA-${ultimoId()}`, origem);
  });
}

// ---- Painel do gestor ----
export const painel = {
  faturamento: () => consultar(
    'SELECT departamento, faturado_centavos, pedidos, volumes FROM vw_faturamento_departamento ORDER BY faturado_centavos DESC',
    [], 'Gestor: faturamento por departamento',
  ),
  estoqueBaixo: () => consultar(
    `SELECT b.id, b.codigo, b.nome, b.unidade, b.quantidade_atual, b.quantidade_minima, b.localizacao, b.reposicao_sugerida, f.razao_social AS fornecedor
     FROM vw_estoque_baixo b LEFT JOIN fornecedores f ON f.id = b.fornecedor_id
     ORDER BY b.quantidade_atual - b.quantidade_minima`,
    [], 'Gestor: estoque baixo',
  ),
  pedidos: () => consultar(
    'SELECT id, cliente, status, total_centavos, criado_em, itens FROM vw_pedidos_resumo ORDER BY id DESC LIMIT 30',
    [], 'Gestor: pedidos',
  ),
  emAberto: () => consultarUm(
    "SELECT COUNT(*) AS n FROM pedidos WHERE status IN ('novo', 'separacao')",
    [], 'Gestor: pedidos em aberto',
  ).n,
  fornecedores: () => consultar(
    `SELECT codigo, razao_social, documento_ficticio, tipo, cidade, uf, contato, prazo_pagamento_dias, produtos, prazo_entrega_dias, comprado_centavos
     FROM vw_fornecedores_resumo ORDER BY comprado_centavos DESC`,
    [], 'Gestor: fornecedores',
  ),
  movimentacoes: () => consultar(
    `SELECT m.criado_em, p.codigo, m.tipo, m.quantidade, m.quantidade_anterior, m.quantidade_atual, m.documento
     FROM movimentacoes_estoque m JOIN produtos p ON p.id = m.produto_id ORDER BY m.id DESC LIMIT 12`,
    [], 'Gestor: movimentações de estoque',
  ),
};

export function pedidosParaCsv() {
  return consultar(
    `SELECT ped.id, ped.criado_em, c.razao_social AS cliente, ped.status, p.codigo, p.nome, i.quantidade, i.preco_unit_centavos, i.total_centavos
     FROM pedido_itens i JOIN pedidos ped ON ped.id = i.pedido_id
     JOIN clientes c ON c.id = ped.cliente_id JOIN produtos p ON p.id = i.produto_id
     ORDER BY ped.id, p.codigo`,
    [], 'Gestor: exportar pedidos',
  );
}
