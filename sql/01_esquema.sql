-- Atacado Digital: esquema do banco (SISTEMA DE DEMONSTRAÇÃO)
-- O mesmo arquivo roda em SQLite e em MySQL/MariaDB, sem tradução.
-- O truque: tudo que é só do MySQL fica em comentários /*! ... */.
-- O MySQL executa o que está dentro deles; o SQLite trata como comentário.
-- Dinheiro é sempre inteiro em centavos, para não haver erro de arredondamento.
-- Origem: projeto acadêmico em legado/ProjetoN3/SQL (ver sql/README.md).

CREATE TABLE departamentos (
    id        INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    slug      VARCHAR(40)  NOT NULL UNIQUE,
    nome      VARCHAR(100) NOT NULL,
    descricao VARCHAR(255),
    ativo     SMALLINT     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

CREATE TABLE fornecedores (
    id                 INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    codigo             VARCHAR(20)  NOT NULL UNIQUE,
    razao_social       VARCHAR(150) NOT NULL,
    documento_ficticio VARCHAR(30)  NOT NULL UNIQUE,
    tipo               VARCHAR(20)  NOT NULL CHECK (tipo IN ('distribuidor', 'fabricante', 'importador', 'atacadista', 'cooperativa')),
    cidade             VARCHAR(100),
    uf                 VARCHAR(2),
    contato            VARCHAR(100),
    email              VARCHAR(120),
    prazo_pagamento_dias INTEGER NOT NULL DEFAULT 30 CHECK (prazo_pagamento_dias >= 0),
    ativo              SMALLINT     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

CREATE TABLE produtos (
    id              INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    codigo          VARCHAR(20)  NOT NULL UNIQUE,
    nome            VARCHAR(150) NOT NULL,
    descricao       VARCHAR(255),
    busca           VARCHAR(300) NOT NULL,
    departamento_id INTEGER      NOT NULL,
    marca           VARCHAR(100),
    unidade         VARCHAR(10)  NOT NULL DEFAULT 'un' CHECK (unidade IN ('un', 'saco', 'caixa', 'fardo', 'galão', 'rolo', 'pacote')),
    qtd_minima      INTEGER      NOT NULL DEFAULT 1 CHECK (qtd_minima >= 1),
    ativo           SMALLINT     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departamento_id) REFERENCES departamentos (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_produtos_departamento ON produtos (departamento_id);

-- Preço por faixa de quantidade: vale a maior faixa com qtd_inicial <= quantidade pedida.
CREATE TABLE faixas_preco (
    id             INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    produto_id     INTEGER NOT NULL,
    qtd_inicial    INTEGER NOT NULL CHECK (qtd_inicial >= 1),
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
    UNIQUE (produto_id, qtd_inicial),
    FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE CASCADE
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

-- Um registro de estoque por produto. O CHECK é a última barreira contra estoque negativo.
CREATE TABLE estoque (
    produto_id        INTEGER PRIMARY KEY,
    quantidade_atual  INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
    quantidade_minima INTEGER NOT NULL DEFAULT 10 CHECK (quantidade_minima >= 0),
    quantidade_maxima INTEGER NOT NULL DEFAULT 1000,
    localizacao       VARCHAR(100),
    custo_centavos    INTEGER NOT NULL DEFAULT 0 CHECK (custo_centavos >= 0),
    FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE CASCADE
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

CREATE TABLE movimentacoes_estoque (
    id                  INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    produto_id          INTEGER NOT NULL,
    tipo                VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'devolucao')),
    quantidade          INTEGER NOT NULL CHECK (quantidade > 0),
    quantidade_anterior INTEGER NOT NULL,
    quantidade_atual    INTEGER NOT NULL,
    motivo              VARCHAR(255),
    documento           VARCHAR(40),
    responsavel         VARCHAR(100),
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_movimentacoes_produto ON movimentacoes_estoque (produto_id, criado_em);

CREATE TABLE fornecedor_produtos (
    fornecedor_id        INTEGER NOT NULL,
    produto_id           INTEGER NOT NULL,
    preco_compra_centavos INTEGER NOT NULL CHECK (preco_compra_centavos > 0),
    prazo_entrega_dias   INTEGER NOT NULL DEFAULT 7 CHECK (prazo_entrega_dias >= 0),
    PRIMARY KEY (fornecedor_id, produto_id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE CASCADE
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

CREATE TABLE compras_fornecedor (
    id             INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    fornecedor_id  INTEGER NOT NULL,
    produto_id     INTEGER NOT NULL,
    quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
    total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id),
    FOREIGN KEY (produto_id) REFERENCES produtos (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_compras_fornecedor ON compras_fornecedor (fornecedor_id);

CREATE TABLE clientes (
    id                 INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    razao_social       VARCHAR(150) NOT NULL,
    documento_ficticio VARCHAR(30)  NOT NULL UNIQUE,
    cidade             VARCHAR(100),
    uf                 VARCHAR(2),
    ativo              SMALLINT     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

-- Quem faz login. O hash vem de password_hash() no PHP; a demonstração no navegador não tem usuários.
CREATE TABLE usuarios (
    id           INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    nome         VARCHAR(100) NOT NULL,
    email        VARCHAR(120) NOT NULL UNIQUE,
    senha_hash   VARCHAR(255) NOT NULL,
    papel        VARCHAR(10)  NOT NULL CHECK (papel IN ('gestor', 'comprador')),
    cliente_id   INTEGER,
    ativo        SMALLINT     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    ultimo_login DATETIME,
    FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;

-- Freio contra tentativa de adivinhar senha.
CREATE TABLE tentativas_login (
    id        INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    chave     VARCHAR(64) NOT NULL,
    criado_em DATETIME    NOT NULL
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_tentativas_chave ON tentativas_login (chave, criado_em);

CREATE TABLE pedidos (
    id              INTEGER PRIMARY KEY /*! AUTO_INCREMENT */,
    cliente_id      INTEGER NOT NULL,
    usuario_id      INTEGER,
    status          VARCHAR(10) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'separacao', 'faturado', 'entregue', 'cancelado')),
    total_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (total_centavos >= 0),
    observacao      VARCHAR(500),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_pedidos_cliente ON pedidos (cliente_id, criado_em);
CREATE INDEX idx_pedidos_status ON pedidos (status);

-- O preço fica gravado no item: mudar a tabela depois não altera pedido antigo.
CREATE TABLE pedido_itens (
    pedido_id           INTEGER NOT NULL,
    produto_id          INTEGER NOT NULL,
    quantidade          INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unit_centavos INTEGER NOT NULL CHECK (preco_unit_centavos > 0),
    total_centavos      INTEGER NOT NULL CHECK (total_centavos > 0),
    PRIMARY KEY (pedido_id, produto_id),
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos (id)
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
CREATE INDEX idx_itens_produto ON pedido_itens (produto_id);

CREATE TABLE configuracoes (
    chave VARCHAR(50)  NOT NULL PRIMARY KEY,
    valor VARCHAR(255) NOT NULL
) /*! ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci */;
