// Peças de tela. Todo texto entra por textContent: dado nenhum vira HTML.
export function h(seletor, props, ...filhos) {
  const [tag, ...classes] = seletor.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  Object.entries(props ?? {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dados') Object.entries(v).forEach(([d, x]) => { el.dataset[d] = x; });
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  });
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  filhos.flat(Infinity).forEach((f) => {
    if (f === null || f === undefined || f === false) return;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  });
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR');
export const dinheiro = (centavos) => moeda.format(centavos / 100);
export const dinheiroCurto = (centavos) => numero.format(Math.floor(centavos / 100)) + ',' + String(centavos % 100).padStart(2, '0');
export const inteiro = (n) => numero.format(n);
export function dataHora(texto) {
  const d = new Date(`${String(texto).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? String(texto) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

let temporizador = null;
export function avisar(texto, tipo = 'ok') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { el.hidden = true; }, 4000);
}

/** Tabela que vira lista empilhada no celular: cada célula leva o nome da coluna. */
export function tabela(colunas, linhas, { classe = '', vazio = 'Nada para mostrar.' } = {}) {
  if (!linhas.length) return h('p.vazio', null, vazio);
  return h(`table.lista${classe ? `.${classe}` : ''}`, null,
    h('thead', null, h('tr', null, colunas.map((c) => h(`th${c.num ? '.num' : ''}`, { scope: 'col' }, c.titulo)))),
    h('tbody', null, linhas.map((l) => h('tr', null, colunas.map((c) => h(`td${c.num ? '.num' : ''}`, { dados: { rotulo: c.titulo } }, c.valor(l)))))));
}

export function confirmar(titulo, texto, rotulo) {
  return new Promise((resolver) => {
    const dlg = h('dialog.dialogo', { 'aria-label': titulo },
      h('div.dialogo-corpo', null,
        h('h2', null, titulo),
        h('p', null, texto),
        h('div.dialogo-acoes', null,
          h('button.botao.botao-claro', { type: 'button', onclick: () => fechar(false) }, 'Voltar'),
          h('button.botao.botao-perigo', { type: 'button', id: 'confirmar-sim', onclick: () => fechar(true) }, rotulo))));
    function fechar(sim) {
      dlg.close();
      dlg.remove();
      resolver(sim);
    }
    dlg.addEventListener('cancel', () => fechar(false));
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = h('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
