// Conferências de texto do repositório: segurança, dados fictícios e regras do projeto.
// Uso: node tests/e2e/estatico.cjs
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '../..');
let falhas = 0;
const t = (nome, cond, info) => { console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${nome}${!cond && info ? ` :: ${JSON.stringify(info)}` : ''}`); if (!cond) falhas++; };
function arquivos(dir, ext) {
  return fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(rel, ext);
    return ext.test(e.name) ? [rel] : [];
  });
}
const ler = (a) => fs.readFileSync(path.join(raiz, a), 'utf8');
const js = arquivos('assets/js', /\.js$/);
const proprios = ['index.html', 'README.md', 'CLAUDE.md', 'legado/README.md', 'sql/README.md', ...js, ...arquivos('sql', /\.sql$/), ...arquivos('assets/css', /\.css$/), ...arquivos('server', /\.(php|htaccess)$/)];

const achar = (lista, re) => lista.filter((a) => re.test(ler(a)));
t('sem innerHTML, outerHTML, insertAdjacentHTML, eval ou document.write', achar(js, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|document\.write|new Function/).length === 0);
t('sem travessão nem meia-risca nos arquivos do projeto', achar(proprios, /[–—]/).length === 0, achar(proprios, /[–—]/));
const html = ler('index.html');
t('CSP declara wasm-unsafe-eval', html.includes("'wasm-unsafe-eval'") && !html.includes("'unsafe-inline'") && !html.includes("'unsafe-eval'"));
t('nenhum script, estilo ou fonte vem de fora', !/(src|href)="https?:\/\/(?!mileumalinhas\.com\.br)/.test(html) && achar(arquivos('assets/css', /\.css$/), /url\(https?:/).length === 0);
const todos = [...proprios, ...arquivos('legado', /\.(html|sql|css)$/i), ...arquivos('tests', /\.(php|cjs)$/)];
t('nenhum CPF com aparência real', achar(todos, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/).length === 0, achar(todos, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/));
t('nenhum CNPJ com aparência real', achar(todos, /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/).length === 0);
// As senhas antigas ficam só como SHA-256, para o próprio teste não as repetir no repositório.
const crypto = require('crypto');
const senhasAntigas = new Set(['240be518fabd2724', '55a5e9e78207b4df', '6b08d780140e292a', 'b578dc5fcbfabbc7']);
const temSenhaAntiga = (a) => (ler(a).match(/[A-Za-z0-9]{6,}/g) || []).some((w) => senhasAntigas.has(crypto.createHash('sha256').update(w).digest('hex').slice(0, 16)));
t('nenhuma senha literal do projeto antigo', todos.filter(temSenhaAntiga).length === 0, todos.filter(temSenhaAntiga));
const dados = ler('sql/03_dados_demo.sql');
t('dados de exemplo sem usuários e sem hash', !/INSERT INTO usuarios/i.test(dados) && !dados.includes('$2y$'));
t('todo e-mail de exemplo usa .invalid', (dados.match(/[\w.]+@[\w.]+/g) || []).every((e) => e.endsWith('.invalid')));
t('todo documento de exemplo é marcado FICT', [...dados.matchAll(/'(FICT-[A-Z]+-\d+)'/g)].length === 10);
t('consultas das telas ficam só na camada de dados', achar(arquivos('assets/js/telas', /\.js$/), /\bconsultar\(|\bexecutar\(/).length === 0);
t('PHP não interpola valor de usuário em SQL', achar(arquivos('server/src', /\.php$/), /(linhas|linha|executar)\(\s*"[^"]*\$(?!where)/).length === 0);
const semAviso = arquivos('legado', /\.html$/i).filter((a) => !ler(a).includes('Sistema de demonstração'));
t('toda página do legado traz o aviso de demonstração', semAviso.length === 0, semAviso);
const readme = ler('README.md').trimEnd().split('\n');
t('README termina com a linha exigida', readme.at(-1) === 'Desenvolvido por Rodrigo Terroso Junior. O Claude, da Anthropic, foi usado como ferramenta durante o desenvolvimento.');
t('versão e licença do sql.js registradas', fs.existsSync(path.join(raiz, 'vendor/sqljs/VERSAO.txt')) && fs.existsSync(path.join(raiz, 'vendor/sqljs/LICENSE')));
console.log(`\nResultado: ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
