-- Banco de Dados: PRODUTOS.SQL
-- Sistema de Atacado Digital do Brasil
-- Tabela para gerenciamento de produtos

USE atacado_digital;

-- Tabela de Categorias
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Produtos
CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    categoria_id INT NOT NULL,
    marca VARCHAR(100),
    unidade_medida ENUM('UN', 'KG', 'L', 'CX', 'PCT', 'M') DEFAULT 'UN',
    preco_unitario DECIMAL(10,2) NOT NULL,
    preco_atacado DECIMAL(10,2) NOT NULL,
    quantidade_minima_atacado INT DEFAULT 10,
    peso DECIMAL(8,3),
    dimensoes VARCHAR(50),
    imagem_url VARCHAR(255),
    observacoes TEXT,
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- Índices para otimização
CREATE INDEX idx_codigo ON produtos(codigo);
CREATE INDEX idx_categoria ON produtos(categoria_id);
CREATE INDEX idx_status ON produtos(status);
CREATE INDEX idx_nome ON produtos(nome);

-- Inserir categorias baseadas nos departamentos do site
INSERT INTO categorias (nome, descricao) VALUES
('Alimentos & Bebidas', 'Produtos alimentícios em geral'),
('Limpeza & Higiene', 'Produtos de limpeza e higiene'),
('Material de Escritório', 'Papelaria e suprimentos'),
('Materiais Elétricos', 'Componentes eletrônicos');

-- Inserir alguns produtos de exemplo
INSERT INTO produtos (codigo, nome, descricao, categoria_id, marca, unidade_medida, preco_unitario, preco_atacado, quantidade_minima_atacado) VALUES
('ALM001', 'Arroz Branco 5kg', 'Arroz branco tipo 1, pacote 5kg', 1, 'Tio João', 'PCT', 12.50, 10.00, 20),
('ALM002', 'Feijão Preto 1kg', 'Feijão preto tipo 1, pacote 1kg', 1, 'Camil', 'PCT', 6.80, 5.50, 30),
('LIM001', 'Detergente Neutro 500ml', 'Detergente líquido neutro', 2, 'Ypê', 'UN', 2.50, 2.00, 50),
('LIM002', 'Sabão em Pó 1kg', 'Sabão em pó para roupas', 2, 'OMO', 'CX', 8.90, 7.50, 25),
('ESC001', 'Papel A4 500 folhas', 'Papel sulfite branco A4', 3, 'Chamex', 'PCT', 18.00, 15.00, 10),
('ESC002', 'Caneta Azul', 'Caneta esferográfica azul', 3, 'BIC', 'UN', 1.50, 1.20, 100),
('ELE001', 'Fita Isolante 19mm', 'Fita isolante preta 19mm x 20m', 4, '3M', 'UN', 4.50, 3.80, 50),
('ELE002', 'Lâmpada LED 9W', 'Lâmpada LED branca fria 9W', 4, 'Philips', 'UN', 12.00, 10.50, 30);

-- Views úteis
-- View para produtos com informações da categoria
CREATE VIEW view_produtos_completo AS
SELECT 
    p.id,
    p.codigo,
    p.nome,
    p.descricao,
    c.nome AS categoria,
    p.marca,
    p.unidade_medida,
    p.preco_unitario,
    p.preco_atacado,
    p.quantidade_minima_atacado,
    p.status,
    p.data_cadastro
FROM produtos p
JOIN categorias c ON p.categoria_id = c.id;

-- Procedures úteis
DELIMITER //

-- Procedure para inserir novo produto
CREATE PROCEDURE InserirProduto(
    IN p_codigo VARCHAR(50),
    IN p_nome VARCHAR(150),
    IN p_descricao TEXT,
    IN p_categoria_id INT,
    IN p_marca VARCHAR(100),
    IN p_unidade_medida ENUM('UN', 'KG', 'L', 'CX', 'PCT', 'M'),
    IN p_preco_unitario DECIMAL(10,2),
    IN p_preco_atacado DECIMAL(10,2),
    IN p_quantidade_minima_atacado INT
)
BEGIN
    INSERT INTO produtos (codigo, nome, descricao, categoria_id, marca, unidade_medida, preco_unitario, preco_atacado, quantidade_minima_atacado)
    VALUES (p_codigo, p_nome, p_descricao, p_categoria_id, p_marca, p_unidade_medida, p_preco_unitario, p_preco_atacado, p_quantidade_minima_atacado);
END //

-- Procedure para buscar produtos por categoria
CREATE PROCEDURE BuscarProdutosPorCategoria(
    IN p_categoria_id INT
)
BEGIN
    SELECT * FROM view_produtos_completo
    WHERE categoria_id = p_categoria_id AND status = 'ativo'
    ORDER BY nome;
END //

DELIMITER ;