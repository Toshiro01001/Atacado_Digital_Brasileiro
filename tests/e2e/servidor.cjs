// Servidor estático mínimo para os testes. Publica o repositório sob um subcaminho, como faz o GitHub Pages.
const http = require('http');
const fs = require('fs');
const path = require('path');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.sql': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const PREFIXO = '/Atacado_Digital_Brasileiro/';

function iniciar(raiz) {
  return new Promise((resolver) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (!url.startsWith(PREFIXO)) { res.writeHead(404); res.end(); return; }
      let arq = path.join(raiz, url.slice(PREFIXO.length));
      if (!arq.startsWith(raiz)) { res.writeHead(403); res.end(); return; }
      if (url.endsWith('/')) arq = path.join(arq, 'index.html');
      fs.readFile(arq, (e, d) => {
        if (e) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolver({ srv, base: `http://127.0.0.1:${srv.address().port}${PREFIXO}` }));
  });
}
module.exports = { iniciar };
