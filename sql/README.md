# Scripts do banco

Rode na ordem: `01_esquema.sql`, `02_visoes.sql`, `03_dados_demo.sql`. Os mesmos arquivos servem para SQLite e MySQL/MariaDB, sem tradução. O que é só do MySQL (`AUTO_INCREMENT`, `ENGINE`, `CHARSET`) está em comentários `/*! ... */`, que o MySQL executa e o SQLite ignora. A versão do navegador e a de servidor leem exatamente estes arquivos.

Em MySQL, crie o banco antes (`CREATE DATABASE atacado_digital CHARACTER SET utf8mb4`). `CHECK` exige MySQL 8.0.16 ou MariaDB 10.2 em diante.

## De onde veio

O modelo nasceu no projeto acadêmico, guardado em `legado/ProjetoN3/SQL/`. A tabela abaixo mostra o que estava lá e o que mudou.

| No projeto acadêmico | O que estava errado | Como ficou |
|---|---|---|
| Todos os arquivos | Sobras de Python no meio do SQL (`cadastro_sql = ...`, `with open(...)`, `print`): nenhum rodava como estava | SQL puro, testado de verdade em SQLite e MariaDB |
| `FUNCIONARIOS.SQL` | Não tinha funcionários: era uma cópia alterada de `ESTOQUE.SQL`, recriando as mesmas tabelas e procedures | Removido. Quem acessa o sistema está em `usuarios` |
| `INICIO.SQL`, `CADASTRO.SQL` | Senhas em texto puro, inclusive a do administrador, e login comparando senha no SQL | `usuarios.senha_hash` com `password_hash`. Nenhum usuário nem senha no repositório |
| `CADASTRO.SQL` | Comprador pessoa física com CPF, em um sistema de atacado | `clientes` são empresas, com documento marcado como fictício |
| `FORNECEDORES.SQL`, `PRODUTOS.SQL` | CNPJs com aparência real e marcas reais | Documentos `FICT-...`, marcas inventadas, e-mails em `.invalid` |
| `produtos.preco_unitario`, `preco_atacado` | Só dois preços, em `DECIMAL` | Tabela `faixas_preco` com quantas faixas precisar, em centavos inteiros |
| `estoque` | Sem garantia de um registro por produto; o gatilho e os `INSERT` criavam duplicatas | `produto_id` é a chave primária, e `CHECK` impede saldo negativo |
| `SaidaEstoque` | Lia o saldo e gravava depois: duas vendas ao mesmo tempo podiam vender a mais | `UPDATE ... WHERE quantidade_atual >= ?` na mesma operação, dentro de transação |
| Gatilho e procedures de movimentação | O gatilho e a procedure registravam a mesma movimentação duas vezes | Uma só gravação, feita pela transação do pedido |
| `BuscarProdutosPorCategoria` | Filtrava por coluna que a view não tinha | Consulta parametrizada em `vw_catalogo` |
| Índices | Repetiam o que `UNIQUE` já cria, e `idx_status` usava o mesmo nome em tabelas diferentes, o que o SQLite não aceita | Só os índices necessários, com nomes únicos |
| Pedidos de venda | Não existiam: o carrinho não gravava nada | `pedidos` e `pedido_itens`, com o preço guardado no item |
| `ENUM`, `DELIMITER`, procedures, gatilhos | Só funcionam no MySQL | `VARCHAR` com `CHECK` e regras no código da aplicação, para valer nos dois bancos |

`categorias` passou a se chamar `departamentos`. `historico_compras` virou `compras_fornecedor`. Ficaram de fora, sem uso nas telas: `tipos_fornecedor` (agora a coluna `tipo`) e `avaliacao_fornecedores`.
