import { abrir, aoRegistrar, aoSalvar, aoMudarEmOutraAba, estaPersistindo } from './banco.js';
import * as carrinho from './carrinho.js';
import { telaCatalogo } from './telas/catalogo.js';
import { telaPedido, telaHistorico, telaDetalhePedido } from './telas/pedido.js';
import { telaGestor } from './telas/gestor.js';
import { telaConsole } from './telas/console.js';

const tela = document.getElementById('tela');
let trocouDeRota = false;

function rotear() {
  const [, aba = 'catalogo', a, b] = window.location.hash.split('/');
  document.querySelectorAll('.abas a').forEach((l) => {
    if (l.dataset.aba === aba) l.setAttribute('aria-current', 'page');
    else l.removeAttribute('aria-current');
  });
  document.body.dataset.aba = aba;
  if (aba === 'pedido' && a && /^[0-9]+$/.test(a)) telaDetalhePedido(tela, Number(a), b === 'novo');
  else if (aba === 'pedido') telaPedido(tela, rotear);
  else if (aba === 'historico') telaHistorico(tela, rotear);
  else if (aba === 'gestor') telaGestor(tela, rotear);
  else if (aba === 'sql') telaConsole(tela);
  else telaCatalogo(tela, a ?? '');
  if (trocouDeRota) {
    window.scrollTo(0, 0);
    tela.querySelector('h1')?.focus({ preventScroll: true });
    trocouDeRota = false;
  }
}

function atualizarContador() {
  const el = document.getElementById('contador-carrinho');
  const n = carrinho.quantidadeItens();
  el.textContent = n;
  el.hidden = n === 0;
}

function atualizarFita(c) {
  document.getElementById('fita-texto').textContent = c.sql;
  document.getElementById('fita-medida').textContent = `${c.ms.toFixed(1).replace('.', ',')} ms`;
}

function mostrarSalvamento(ok) {
  document.getElementById('estado-salvamento').textContent = ok
    ? 'Seus testes ficam salvos neste navegador, só neste aparelho.'
    : 'O navegador bloqueou o armazenamento: o que você fizer aqui vale só até fechar esta aba.';
}

async function iniciar() {
  aoRegistrar(atualizarFita);
  aoSalvar(mostrarSalvamento);
  carrinho.aoMudar(atualizarContador);
  atualizarContador();
  document.getElementById('abrir-como').addEventListener('click', () => document.getElementById('dialogo-como').showModal());
  document.getElementById('fita-sql').addEventListener('click', () => { window.location.hash = '#/sql'; });
  try {
    await abrir();
  } catch (erro) {
    console.warn(erro);
    document.getElementById('carregando').textContent = 'Não foi possível preparar a loja de exemplo neste navegador. Atualize a página ou tente um navegador mais recente, como Chrome, Firefox ou Safari atualizados.';
    return;
  }
  mostrarSalvamento(estaPersistindo());
  aoMudarEmOutraAba(rotear);
  window.addEventListener('hashchange', () => { trocouDeRota = true; rotear(); });
  rotear();
}

iniciar();
