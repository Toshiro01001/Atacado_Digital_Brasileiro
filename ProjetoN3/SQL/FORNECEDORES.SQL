
fornecedores_sql =  Banco de Dados: FORNECEDORES.SQL

USE atacado_digital;

-- Tabela de Tipos de Fornecedor
CREATE TABLE tipos_fornecedor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Fornecedores
CREATE TABLE fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_fornecedor VARCHAR(20) UNIQUE NOT NULL,
    razao_social VARCHAR(150) NOT NULL,
    nome_fantasia VARCHAR(150),
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    inscricao_estadual VARCHAR(20),
    inscricao_municipal VARCHAR(20),
    tipo_fornecedor_id INT NOT NULL,
    endereco VARCHAR(255),
    numero VARCHAR(10),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    cep VARCHAR(9),
    telefone VARCHAR(15),
    celular VARCHAR(15),
    email VARCHAR(100),
    site VARCHAR(100),
    contato_principal VARCHAR(100),
    cargo_contato VARCHAR(100),
    telefone_contato VARCHAR(15),
    email_contato VARCHAR(100),
    banco VARCHAR(100),
    agencia VARCHAR(10),
    conta VARCHAR(20),
    pix VARCHAR(100),
    prazo_pagamento INT DEFAULT 30,
    limite_credito DECIMAL(12,2) DEFAULT 0.00,
    desconto_padrao DECIMAL(5,2) DEFAULT 0.00,
    observacoes TEXT,
    data_cadastro_empresa DATE,
    status ENUM('ativo', 'inativo', 'bloqueado', 'pendente') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tipo_fornecedor_id) REFERENCES tipos_fornecedor(id)
);

-- Tabela de Produtos por Fornecedor
CREATE TABLE fornecedor_produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT NOT NULL,
    produto_id INT NOT NULL,
    codigo_fornecedor VARCHAR(50),
    preco_compra DECIMAL(10,2) NOT NULL,
    prazo_entrega INT DEFAULT 7,
    quantidade_minima INT DEFAULT 1,
    desconto_quantidade DECIMAL(5,2) DEFAULT 0.00,
    observacoes TEXT,
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_fornecedor_produto (fornecedor_id, produto_id)
);

-- Tabela de Histórico de Compras
CREATE TABLE historico_compras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT NOT NULL,
    numero_pedido VARCHAR(50),
    data_pedido DATE NOT NULL,
    data_entrega_prevista DATE,
    data_entrega_real DATE,
    valor_total DECIMAL(12,2) NOT NULL,
    desconto DECIMAL(12,2) DEFAULT 0.00,
    valor_final DECIMAL(12,2) NOT NULL,
    forma_pagamento ENUM('dinheiro', 'pix', 'transferencia', 'boleto', 'cartao', 'prazo') DEFAULT 'prazo',
    status_pedido ENUM('pendente', 'confirmado', 'enviado', 'entregue', 'cancelado') DEFAULT 'pendente',
    observacoes TEXT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE CASCADE
);

-- Tabela de Avaliação de Fornecedores
CREATE TABLE avaliacao_fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT NOT NULL,
    criterio ENUM('qualidade', 'preco', 'prazo', 'atendimento', 'geral') NOT NULL,
    nota INT NOT NULL CHECK (nota >= 1 AND nota <= 5),
    comentario TEXT,
    avaliado_por VARCHAR(100),
    data_avaliacao DATE NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE CASCADE
);

-- Índices para otimização
CREATE INDEX idx_codigo_fornecedor ON fornecedores(codigo_fornecedor);
CREATE INDEX idx_cnpj_fornecedor ON fornecedores(cnpj);
CREATE INDEX idx_razao_social ON fornecedores(razao_social);
CREATE INDEX idx_tipo_fornecedor ON fornecedores(tipo_fornecedor_id);
CREATE INDEX idx_status_fornecedor ON fornecedores(status);
CREATE INDEX idx_fornecedor_produto ON fornecedor_produtos(fornecedor_id, produto_id);
CREATE INDEX idx_historico_fornecedor ON historico_compras(fornecedor_id);
CREATE INDEX idx_data_pedido ON historico_compras(data_pedido);

-- Inserir tipos de fornecedor
INSERT INTO tipos_fornecedor (nome, descricao) VALUES
('Distribuidor', 'Fornecedores distribuidores de produtos'),
('Fabricante', 'Fabricantes diretos de produtos'),
('Importador', 'Importadores de produtos internacionais'),
('Atacadista', 'Fornecedores atacadistas'),
('Cooperativa', 'Cooperativas de produtores'),
('Prestador de Serviços', 'Fornecedores de serviços');

-- Inserir fornecedores de exemplo
INSERT INTO fornecedores (codigo_fornecedor, razao_social, nome_fantasia, cnpj, tipo_fornecedor_id, endereco, cidade, estado, cep, telefone, email, contato_principal, prazo_pagamento, limite_credito) VALUES
('FORN001', 'Distribuidora Alimentos Ltda', 'Distribuidora Central', '11.222.333/0001-44', 1, 'Av. Industrial, 1000', 'São Paulo', 'SP', '01000-000', '(11) 3333-1111', 'contato@distribuidoracentral.com', 'João Distribuidor', 30, 50000.00),
('FORN002', 'Fábrica de Limpeza S.A.', 'Clean Master', '22.333.444/0001-55', 2, 'Rua da Indústria, 500', 'Guarulhos', 'SP', '02000-000', '(11) 3333-2222', 'vendas@cleanmaster.com', 'Maria Fabricante', 45, 75000.00),
('FORN003', 'Papelaria Escritório Ltda', 'Papel & Cia', '33.444.555/0001-66', 1, 'Av. Comercial, 200', 'São Paulo', 'SP', '03000-000', '(11) 3333-3333', 'pedidos@papelecia.com', 'Pedro Papeleiro', 30, 25000.00),
('FORN004', 'Elétrica Industrial S.A.', 'Eletro Tech', '44.555.666/0001-77', 2, 'Rua Elétrica, 300', 'São Bernardo', 'SP', '04000-000', '(11) 3333-4444', 'comercial@eletrotech.com', 'Ana Elétrica', 60, 100000.00),
('FORN005', 'Cooperativa Agrícola', 'Coop Alimentos', '55.666.777/0001-88', 5, 'Estrada Rural, Km 10', 'Campinas', 'SP', '05000-000', '(19) 3333-5555', 'vendas@coopalimentos.com', 'Carlos Cooperado', 15, 30000.00);

-- Inserir produtos por fornecedor (relacionando com produtos existentes)
INSERT INTO fornecedor_produtos (fornecedor_id, produto_id, codigo_fornecedor, preco_compra, prazo_entrega, quantidade_minima) VALUES
(1, 1, 'ARR001', 8.50, 5, 20),
(1, 2, 'FEI001', 4.20, 5, 30),
(2, 3, 'DET001', 1.80, 7, 50),
(2, 4, 'SAB001', 6.50, 7, 25),
(3, 5, 'PAP001', 12.00, 3, 10),
(3, 6, 'CAN001', 0.90, 3, 100),
(4, 7, 'FIT001', 2.80, 10, 50),
(4, 8, 'LAM001', 8.20, 10, 30);

-- Inserir histórico de compras de exemplo
INSERT INTO historico_compras (fornecedor_id, numero_pedido, data_pedido, data_entrega_prevista, valor_total, valor_final, forma_pagamento, status_pedido) VALUES
(1, 'PED001', '2024-01-15', '2024-01-20', 5000.00, 5000.00, 'prazo', 'entregue'),
(2, 'PED002', '2024-02-10', '2024-02-17', 3500.00, 3500.00, 'prazo', 'entregue'),
(3, 'PED003', '2024-03-05', '2024-03-08', 2000.00, 2000.00, 'pix', 'entregue'),
(4, 'PED004', '2024-04-12', '2024-04-22', 8000.00, 8000.00, 'prazo', 'confirmado'),
(5, 'PED005', '2024-05-20', '2024-06-05', 1500.00, 1500.00, 'boleto', 'pendente');

-- Views úteis
-- View para fornecedores com informações completas
CREATE VIEW view_fornecedores_completo AS
SELECT 
    f.id,
    f.codigo_fornecedor,
    f.razao_social,
    f.nome_fantasia,
    f.cnpj,
    tf.nome AS tipo_fornecedor,
    f.cidade,
    f.estado,
    f.telefone,
    f.email,
    f.contato_principal,
    f.prazo_pagamento,
    f.limite_credito,
    f.status,
    f.data_cadastro
FROM fornecedores f
JOIN tipos_fornecedor tf ON f.tipo_fornecedor_id = tf.id;

-- View para produtos por fornecedor com preços
CREATE VIEW view_produtos_fornecedor AS
SELECT 
    f.razao_social AS fornecedor,
    f.codigo_fornecedor,
    p.codigo AS codigo_produto,
    p.nome AS produto,
    fp.codigo_fornecedor AS codigo_no_fornecedor,
    fp.preco_compra,
    p.preco_unitario,
    (p.preco_unitario - fp.preco_compra) AS margem_lucro,
    ROUND(((p.preco_unitario - fp.preco_compra) / fp.preco_compra * 100), 2) AS percentual_lucro,
    fp.prazo_entrega,
    fp.quantidade_minima
FROM fornecedores f
JOIN fornecedor_produtos fp ON f.id = fp.fornecedor_id
JOIN produtos p ON fp.produto_id = p.id
WHERE f.status = 'ativo' AND fp.status = 'ativo';

-- View para ranking de fornecedores por volume de compras
CREATE VIEW view_ranking_fornecedores AS
SELECT 
    f.razao_social,
    f.codigo_fornecedor,
    COUNT(hc.id) AS total_pedidos,
    SUM(hc.valor_final) AS valor_total_comprado,
    AVG(hc.valor_final) AS ticket_medio,
    MAX(hc.data_pedido) AS ultima_compra
FROM fornecedores f
LEFT JOIN historico_compras hc ON f.id = hc.fornecedor_id
WHERE f.status = 'ativo'
GROUP BY f.id, f.razao_social, f.codigo_fornecedor
ORDER BY valor_total_comprado DESC;

-- Procedures úteis
DELIMITER //

-- Procedure para inserir novo fornecedor
CREATE PROCEDURE InserirFornecedor(
    IN p_razao_social VARCHAR(150),
    IN p_nome_fantasia VARCHAR(150),
    IN p_cnpj VARCHAR(18),
    IN p_tipo_fornecedor_id INT,
    IN p_endereco VARCHAR(255),
    IN p_cidade VARCHAR(100),
    IN p_estado VARCHAR(2),
    IN p_cep VARCHAR(9),
    IN p_telefone VARCHAR(15),
    IN p_email VARCHAR(100),
    IN p_contato_principal VARCHAR(100),
    IN p_prazo_pagamento INT,
    IN p_limite_credito DECIMAL(12,2)
)
BEGIN
    DECLARE v_codigo VARCHAR(20);
    DECLARE v_proximo_numero INT;
    
    -- Gerar código automático
    SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_fornecedor, 5) AS UNSIGNED)), 0) + 1 
    INTO v_proximo_numero
    FROM fornecedores 
    WHERE codigo_fornecedor REGEXP '^FORN[0-9]+$';
    
    SET v_codigo = CONCAT('FORN', LPAD(v_proximo_numero, 3, '0'));
    
    INSERT INTO fornecedores (codigo_fornecedor, razao_social, nome_fantasia, cnpj, tipo_fornecedor_id, endereco, cidade, estado, cep, telefone, email, contato_principal, prazo_pagamento, limite_credito)
    VALUES (v_codigo, p_razao_social, p_nome_fantasia, p_cnpj, p_tipo_fornecedor_id, p_endereco, p_cidade, p_estado, p_cep, p_telefone, p_email, p_contato_principal, p_prazo_pagamento, p_limite_credito);
END //

-- Procedure para associar produto ao fornecedor
CREATE PROCEDURE AssociarProdutoFornecedor(
    IN p_fornecedor_id INT,
    IN p_produto_id INT,
    IN p_codigo_fornecedor VARCHAR(50),
    IN p_preco_compra DECIMAL(10,2),
    IN p_prazo_entrega INT,
    IN p_quantidade_minima INT
)
BEGIN
    INSERT INTO fornecedor_produtos (fornecedor_id, produto_id, codigo_fornecedor, preco_compra, prazo_entrega, quantidade_minima)
    VALUES (p_fornecedor_id, p_produto_id, p_codigo_fornecedor, p_preco_compra, p_prazo_entrega, p_quantidade_minima)
    ON DUPLICATE KEY UPDATE
    preco_compra = p_preco_compra,
    prazo_entrega = p_prazo_entrega,
    quantidade_minima = p_quantidade_minima,
    data_atualizacao = CURRENT_TIMESTAMP;
END //

-- Procedure para registrar compra
CREATE PROCEDURE RegistrarCompra(
    IN p_fornecedor_id INT,
    IN p_numero_pedido VARCHAR(50),
    IN p_data_pedido DATE,
    IN p_data_entrega_prevista DATE,
    IN p_valor_total DECIMAL(12,2),
    IN p_desconto DECIMAL(12,2),
    IN p_forma_pagamento ENUM('dinheiro', 'pix', 'transferencia', 'boleto', 'cartao', 'prazo')
)
BEGIN
    DECLARE v_valor_final DECIMAL(12,2);
    SET v_valor_final = p_valor_total - COALESCE(p_desconto, 0);
    
    INSERT INTO historico_compras (fornecedor_id, numero_pedido, data_pedido, data_entrega_prevista, valor_total, desconto, valor_final, forma_pagamento)
    VALUES (p_fornecedor_id, p_numero_pedido, p_data_pedido, p_data_entrega_prevista, p_valor_total, p_desconto, v_valor_final, p_forma_pagamento);
END //

-- Procedure para avaliar fornecedor
CREATE PROCEDURE AvaliarFornecedor(
    IN p_fornecedor_id INT,
    IN p_criterio ENUM('qualidade', 'preco', 'prazo', 'atendimento', 'geral'),
    IN p_nota INT,
    IN p_comentario TEXT,
    IN p_avaliado_por VARCHAR(100)
)
BEGIN
    INSERT INTO avaliacao_fornecedores (fornecedor_id, criterio, nota, comentario, avaliado_por, data_avaliacao)
    VALUES (p_fornecedor_id, p_criterio, p_nota, p_comentario, p_avaliado_por, CURDATE());
END //

-- Procedure para buscar melhor preço de produto
CREATE PROCEDURE BuscarMelhorPreco(
    IN p_produto_id INT
)
BEGIN
    SELECT 
        f.razao_social,
        f.codigo_fornecedor,
        fp.preco_compra,
        fp.prazo_entrega,
        fp.quantidade_minima,
        f.telefone,
        f.email
    FROM fornecedor_produtos fp
    JOIN fornecedores f ON fp.fornecedor_id = f.id
    WHERE fp.produto_id = p_produto_id
    AND f.status = 'ativo'
    AND fp.status = 'ativo'
    ORDER BY fp.preco_compra ASC;
END //

DELIMITER ;

-- Triggers
DELIMITER //

-- Trigger para gerar código automático do fornecedor
CREATE TRIGGER trigger_gerar_codigo_fornecedor
BEFORE INSERT ON fornecedores
FOR EACH ROW
BEGIN
    DECLARE v_proximo_numero INT;
    
    IF NEW.codigo_fornecedor IS NULL OR NEW.codigo_fornecedor = '' THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_fornecedor, 5) AS UNSIGNED)), 0) + 1 
        INTO v_proximo_numero
        FROM fornecedores 
        WHERE codigo_fornecedor REGEXP '^FORN[0-9]+$';
        
        SET NEW.codigo_fornecedor = CONCAT('FORN', LPAD(v_proximo_numero, 3, '0'));
    END IF;
END //

DELIMITER ;"""

with open('FORNECEDORES.SQL', 'w', encoding='utf-8') as f:
    f.write(fornecedores_sql)

print("Arquivo FORNECEDORES.SQL criado com sucesso!")