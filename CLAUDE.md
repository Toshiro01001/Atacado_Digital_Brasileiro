# Atacado Digital Brasileiro

Sistema de demonstração de atacado B2B, com dados fictícios, em duas camadas que usam os mesmos scripts de `sql/`:

- `index.html` e `assets/`: SQLite no navegador (sql.js em `vendor/`). Roda no GitHub Pages.
- `server/`: PHP 8 com PDO e API JSON. SQLite por padrão, MySQL por variável de ambiente.
- `tests/`: testes da API (PHP sem framework) e do navegador (Playwright).
- `legado/`: o projeto acadêmico original (`ProjetoN3`), só como registro.

## Como este projeto funciona

- O PHP precisa de servidor: o GitHub Pages serve só a parte estática.
- Sem build. Consultas sempre parametrizadas, e o texto na tela entra por `textContent`.
- Todo dado de exemplo é fictício e rotulado (`FICT-...`, e-mails `.invalid`). Sem usuários nem senhas no repositório.

## Regras de trabalho

- Responda em português do Brasil, sem travessões, e chame o dono de Rodrigo Jr.
- Altere só o que foi pedido. Publicar ou fazer merge no `main` depende de pedido dele.
- Toda função criada ou alterada precisa funcionar também no celular. Teste a versão mobile, não só a de computador.
- Ao criar ou alterar o site, explique como ele funciona.
- Ao terminar uma alteração, entregue a mensagem de commit em dois blocos rotulados: "Título" (até 50 caracteres) e "Descrição" (estendida, com exatamente o que foi feito).
- Entregue arquivos soltos, nunca em `.zip`.
- O repositório é público: não coloque senhas, chaves secretas nem dados pessoais em arquivos versionados.
