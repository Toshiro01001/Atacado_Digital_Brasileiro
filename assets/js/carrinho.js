// Carrinho e preferências do visitante. Se o navegador bloquear o armazenamento, vale só nesta aba.
const CHAVE = 'atacado-carrinho';
const CHAVE_CLIENTE = 'atacado-cliente';
let itens = ler(CHAVE, {});
let clienteId = ler(CHAVE_CLIENTE, null);
const ouvintes = new Set();

function ler(chave, padrao) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v ?? padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* segue só em memória */ }
}

function mudou() {
  gravar(CHAVE, itens);
  ouvintes.forEach((fn) => fn());
}

export const aoMudar = (fn) => ouvintes.add(fn);
export const conteudo = () => ({ ...itens });
export const quantidadeItens = () => Object.keys(itens).length;
export const clienteAtual = () => clienteId;
export function definirCliente(id) {
  clienteId = id;
  gravar(CHAVE_CLIENTE, id);
}
export function somar(produtoId, quantidade) {
  itens[produtoId] = (itens[produtoId] ?? 0) + quantidade;
  mudou();
}
export function definir(produtoId, quantidade) {
  if (quantidade > 0) itens[produtoId] = quantidade;
  else delete itens[produtoId];
  mudou();
}
export function esvaziar() {
  itens = {};
  mudou();
}
