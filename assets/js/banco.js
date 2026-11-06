// Núcleo do banco no navegador: abre o SQLite (sql.js), guarda no IndexedDB e registra toda consulta.
const VERSAO_DADOS = '1';
const IDB_NOME = 'atacado-digital';
const IDB_LOJA = 'arquivos';
const IDB_CHAVE = 'banco';
const ARQUIVOS_SQL = ['sql/01_esquema.sql', 'sql/02_visoes.sql', 'sql/03_dados_demo.sql'];

let SQL = null;
let db = null;
let persistente = true;
const canal = 'BroadcastChannel' in window ? new BroadcastChannel('atacado-digital') : null;

// ---- Registro de consultas: é dele que saem a faixa de SQL e o console ----
const registro = [];
const ouvintes = new Set();
export const aoRegistrar = (fn) => ouvintes.add(fn);
export const consultasRegistradas = () => registro;

function registrar(sql, params, origem, ms, linhas) {
  const texto = sql.replace(/\s+/g, ' ').trim();
  const ultima = registro[0];
  if (ultima && ultima.sql === texto && ultima.origem === origem) {
    ultima.vezes += 1;
    ultima.params = params;
    ultima.ms = ms;
    ultima.linhas = linhas;
  } else {
    registro.unshift({ sql: texto, params, origem, ms, linhas, vezes: 1 });
    if (registro.length > 150) registro.pop();
  }
  ouvintes.forEach((fn) => fn(registro[0]));
}

// ---- Consultas: sempre com parâmetros, nunca colando valor no texto ----
export function consultar(sql, params = [], origem = 'Sistema') {
  const inicio = performance.now();
  const st = db.prepare(sql);
  const linhas = [];
  try {
    st.bind(params);
    while (st.step()) linhas.push(st.getAsObject());
  } finally {
    st.free();
  }
  registrar(sql, params, origem, performance.now() - inicio, linhas.length);
  return linhas;
}

export const consultarUm = (sql, params, origem) => consultar(sql, params, origem)[0] ?? null;

export function executar(sql, params = [], origem = 'Sistema') {
  const inicio = performance.now();
  db.run(sql, params);
  const alteradas = db.getRowsModified();
  registrar(sql, params, origem, performance.now() - inicio, alteradas);
  return alteradas;
}

export const ultimoId = () => db.exec('SELECT last_insert_rowid()')[0].values[0][0];

/** Tudo dentro de fn é gravado junto ou nada é gravado. */
export function transacao(origem, fn) {
  executar('BEGIN IMMEDIATE', [], origem);
  try {
    const r = fn();
    executar('COMMIT', [], origem);
    salvar();
    return r;
  } catch (erro) {
    executar('ROLLBACK', [], origem);
    throw erro;
  }
}

// ---- Abertura, criação e restauração ----
function aplicarPragmas(banco) {
  banco.run('PRAGMA foreign_keys = ON');
}

async function criarDoZero() {
  const textos = await Promise.all(ARQUIVOS_SQL.map(async (a) => {
    const r = await fetch(a, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Não foi possível ler ${a} (${r.status}).`);
    return r.text();
  }));
  const novo = new SQL.Database();
  aplicarPragmas(novo);
  novo.run('BEGIN');
  textos.forEach((t) => novo.run(t));
  novo.run('COMMIT');
  return novo;
}

function versaoValida(banco) {
  try {
    const r = banco.exec("SELECT valor FROM configuracoes WHERE chave = 'versao_dados'");
    return r[0]?.values[0][0] === VERSAO_DADOS;
  } catch {
    return false;
  }
}

export async function abrir() {
  SQL = await window.initSqlJs({ locateFile: (arquivo) => `vendor/sqljs/${arquivo}` });
  const salvo = await idbLer();
  if (salvo) {
    const candidato = new SQL.Database(salvo);
    if (versaoValida(candidato)) {
      db = candidato;
      aplicarPragmas(db);
      return { restaurado: true };
    }
    candidato.close();
  }
  db = await criarDoZero();
  salvar();
  return { restaurado: false };
}

export async function restaurar() {
  const novo = await criarDoZero();
  db.close();
  db = novo;
  await idbGravar(bytes());
  registrar('-- Banco recriado a partir de sql/01_esquema.sql, 02_visoes.sql e 03_dados_demo.sql', [], 'Restaurar dados', 0, 0);
  canal?.postMessage('mudou');
}

function bytes() {
  // export() fecha e reabre a conexão interna: os PRAGMAs precisam ser reaplicados.
  const b = db.export();
  aplicarPragmas(db);
  return b;
}

export const exportarBytes = bytes;

// ---- Banco descartável para o console: nada do que rodar nele alcança o banco real ----
export function copiaSomenteLeitura() {
  const copia = new SQL.Database(bytes());
  copia.run('PRAGMA query_only = ON');
  return copia;
}

// ---- Persistência ----
const ouvintesSalvar = new Set();
export const aoSalvar = (fn) => ouvintesSalvar.add(fn);
export const estaPersistindo = () => persistente;

export function salvar() {
  idbGravar(bytes()).then(() => canal?.postMessage('mudou'));
}

function idbAbrir() {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(IDB_NOME, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(IDB_LOJA);
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function idbLer() {
  try {
    const base = await idbAbrir();
    const valor = await new Promise((resolver, rejeitar) => {
      const r = base.transaction(IDB_LOJA).objectStore(IDB_LOJA).get(IDB_CHAVE);
      r.onsuccess = () => resolver(r.result ?? null);
      r.onerror = () => rejeitar(r.error);
    });
    base.close();
    return valor;
  } catch {
    persistente = false;
    return null;
  }
}

async function idbGravar(conteudo) {
  try {
    const base = await idbAbrir();
    await new Promise((resolver, rejeitar) => {
      const t = base.transaction(IDB_LOJA, 'readwrite');
      t.objectStore(IDB_LOJA).put(conteudo, IDB_CHAVE);
      t.oncomplete = resolver;
      t.onerror = () => rejeitar(t.error);
    });
    base.close();
    persistente = true;
  } catch {
    persistente = false;
  }
  ouvintesSalvar.forEach((fn) => fn(persistente));
}

// Outra aba gravou: recarrega para esta aba não vender estoque que já saiu.
export function aoMudarEmOutraAba(fn) {
  if (!canal) return;
  canal.onmessage = async () => {
    const salvo = await idbLer();
    if (!salvo) return;
    db.close();
    db = new SQL.Database(salvo);
    aplicarPragmas(db);
    fn();
  };
}
