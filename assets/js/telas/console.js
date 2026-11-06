import { h, inteiro } from '../ui.js';
import { copiaSomenteLeitura, consultasRegistradas } from '../banco.js';

const LIMITE_LINHAS = 500;
const EXEMPLO = `SELECT d.nome AS departamento, COUNT(*) AS produtos, SUM(e.quantidade_atual) AS unidades
FROM produtos p
JOIN departamentos d ON d.id = p.departamento_id
JOIN estoque e ON e.produto_id = p.id
GROUP BY d.nome
ORDER BY unidades DESC`;

let textoEditor = EXEMPLO;
let executarAoAbrir = false;

export function abrirNoConsole(consulta) {
  textoEditor = comValores(consulta);
  executarAoAbrir = /^(SELECT|WITH)\b/i.test(consulta.sql);
  window.location.hash = '#/sql';
}

/** Troca cada ? pelo valor usado, só para leitura no editor. Quem executa é o banco descartável. */
function comValores({ sql, params }) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = params?.[i++];
    if (v === null || v === undefined) return 'NULL';
    return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  });
}

/** Tira comentários e textos para examinar só a estrutura do comando. */
function esqueleto(sql) {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
}

/** Primeira barreira: mensagem clara. A garantia real é a cópia descartável com query_only. */
export function validarLeitura(sql) {
  const base = esqueleto(sql).replace(/;\s*$/, '');
  if (!base) return 'Escreva uma consulta.';
  if (base.includes(';')) return 'Rode um comando por vez.';
  if (!/^(SELECT|WITH|EXPLAIN)\b/i.test(base)) return 'Este console é só de leitura: use SELECT, WITH ou EXPLAIN.';
  if (/\bRECURSIVE\b/i.test(base)) return 'Consultas recursivas ficam de fora: poderiam travar a aba.';
  return null;
}

export function rodarConsulta(sql) {
  const problema = validarLeitura(sql);
  if (problema) return { erro: problema };
  let copia = null;
  let st = null;
  try {
    copia = copiaSomenteLeitura();
    const inicio = performance.now();
    st = copia.prepare(sql);
    const colunas = st.getColumnNames();
    const linhas = [];
    let cortou = false;
    while (st.step()) {
      if (linhas.length === LIMITE_LINHAS) { cortou = true; break; }
      linhas.push(st.get());
    }
    return { colunas, linhas, cortou, ms: performance.now() - inicio };
  } catch (e) {
    return { erro: `O banco recusou: ${e.message}` };
  } finally {
    st?.free();
    copia?.close();
  }
}

const mostrarValor = (v) => {
  if (v === null) return 'NULL';
  if (v instanceof Uint8Array) return `[binário, ${v.length} bytes]`;
  return String(v);
};

export function telaConsole(alvo) {
  const resultado = h('div.resultado', { id: 'resultado', 'aria-live': 'polite' });
  const editor = h('textarea.editor', {
    id: 'editor-sql', rows: 7, autocapitalize: 'off', value: textoEditor,
    'aria-label': 'Consulta SQL', oninput: (e) => { textoEditor = e.target.value; },
  });

  editor.spellcheck = false;

  function rodar() {
    const r = rodarConsulta(editor.value);
    if (r.erro) {
      resultado.replaceChildren(h('p.erro-sql', { role: 'alert' }, r.erro));
      return;
    }
    resultado.replaceChildren(
      h('p.nota', { id: 'resultado-resumo' }, `${inteiro(r.linhas.length)} linhas em ${r.ms.toFixed(1).replace('.', ',')} ms.${r.cortou ? ` Mostrando só as primeiras ${LIMITE_LINHAS}.` : ''}`),
      h('div.rolagem-tabela', { tabIndex: 0, role: 'region', 'aria-label': 'Resultado da consulta' },
        h('table.tabela-sql', null,
          h('thead', null, h('tr', null, r.colunas.map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', null, r.linhas.map((l) => h('tr', null, l.map((v) => h('td', null, mostrarValor(v)))))))));
  }

  const copia = copiaSomenteLeitura();
  const objetos = copia.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name")[0].values;
  copia.close();

  alvo.replaceChildren(h('section.pagina.console', null,
    h('div.barra', null, h('h1', { tabIndex: -1 }, 'Console SQL'),
      h('p.nota', null, 'Só leitura. Cada consulta roda em uma cópia descartável do banco.')),
    h('div.console-grade', null,
      h('div.console-principal', null,
        editor,
        h('div.console-acoes', null,
          h('button.botao.botao-principal', { type: 'button', id: 'executar-sql', onclick: rodar }, 'Executar'),
          h('button.botao.botao-claro', { type: 'button', onclick: () => { editor.value = EXEMPLO; textoEditor = EXEMPLO; rodar(); } }, 'Carregar exemplo')),
        resultado,
        h('details.objetos', null,
          h('summary', null, `Tabelas e visões (${objetos.length})`),
          h('ul', null, objetos.map(([nome, tipo]) => h('li', null,
            h('button.botao-texto', { type: 'button', onclick: () => { editor.value = `SELECT * FROM ${nome} LIMIT 50`; textoEditor = editor.value; rodar(); } }, nome),
            h('span.nota', null, tipo === 'view' ? ' visão' : ' tabela')))))),
      h('aside.console-historico', { 'aria-label': 'Consultas executadas pelas telas' },
        h('h2', null, 'O que as telas executaram'),
        h('p.nota', null, 'Comandos reais, do mais recente ao mais antigo. Toque em uma consulta para abrir no editor.'),
        h('ol.lista-consultas', { id: 'lista-consultas' }, consultasRegistradas().slice(0, 60).map((c) => h('li', null,
          h('button.consulta', {
            type: 'button',
            onclick: () => { textoEditor = comValores(c); editor.value = textoEditor; if (/^(SELECT|WITH)\b/i.test(c.sql)) rodar(); else resultado.replaceChildren(h('p.nota', null, 'Este comando altera dados: fica aqui para leitura e não roda no console.')); },
          },
          h('span.consulta-origem', null, c.origem),
          h('code', null, c.sql),
          h('span.consulta-medida', null, `${c.params?.length ? `Parâmetros: ${JSON.stringify(c.params)}. ` : ''}${c.vezes > 1 ? `${c.vezes} vezes. ` : ''}${c.ms.toFixed(1).replace('.', ',')} ms`)))))))));
  if (executarAoAbrir) {
    executarAoAbrir = false;
    rodar();
  }
}
