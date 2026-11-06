# Criando o arquivo ESTOQUE.SQL completo
estoque_sql = Banco de Dados: ESTOQUE.SQL

USE atacado_digital;

-- Tabela de Estoque
CREATE TABLE estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    quantidade_atual INT NOT NULL DEFAULT 0,
    quantidade_minima INT NOT NULL DEFAULT 10,
    quantidade_maxima INT NOT NULL DEFAULT 1000,
    localizacao VARCHAR(100),
    lote VARCHAR(50),
    data_validade DATE,
    data_entrada DATE,
    valor_custo DECIMAL(10,2),
    observacoes TEXT,
    status ENUM('disponivel', 'reservado', 'vencido', 'bloqueado') DEFAULT 'disponivel',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

-- Tabela de Movimentação de Estoque
CREATE TABLE movimentacao_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    tipo_movimentacao ENUM('entrada', 'saida', 'ajuste', 'perda', 'devolucao') NOT NULL,
    quantidade INT NOT NULL,
    quantidade_anterior INT NOT NULL,
    quantidade_atual INT NOT NULL,
    motivo VARCHAR(255),
    usuario_responsavel VARCHAR(100),
    documento_referencia VARCHAR(100),
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

-- Índices para otimização
CREATE INDEX idx_produto_estoque ON estoque(produto_id);
CREATE INDEX idx_status_estoque ON estoque(status);
CREATE INDEX idx_quantidade_minima ON estoque(quantidade_atual, quantidade_minima);
CREATE INDEX idx_produto_movimentacao ON movimentacao_estoque(produto_id);
CREATE INDEX idx_tipo_movimentacao ON movimentacao_estoque(tipo_movimentacao);
CREATE INDEX idx_data_movimentacao ON movimentacao_estoque(data_movimentacao);

-- Inserir dados de estoque para os produtos existentes
INSERT INTO estoque (produto_id, quantidade_atual, quantidade_minima, quantidade_maxima, localizacao, valor_custo) VALUES
(1, 150, 20, 500, 'Setor A - Prateleira 1', 8.50),
(2, 200, 30, 600, 'Setor A - Prateleira 2', 4.20),
(3, 300, 50, 1000, 'Setor B - Prateleira 1', 1.80),
(4, 100, 25, 400, 'Setor B - Prateleira 2', 6.50),
(5, 80, 10, 200, 'Setor C - Prateleira 1', 12.00),
(6, 500, 100, 2000, 'Setor C - Prateleira 2', 0.90),
(7, 250, 50, 800, 'Setor D - Prateleira 1', 2.80),
(8, 180, 30, 600, 'Setor D - Prateleira 2', 8.20);

-- Inserir algumas movimentações de exemplo
INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, usuario_responsavel) VALUES
(1, 'entrada', 50, 100, 150, 'Compra fornecedor', 'admin'),
(2, 'entrada', 100, 100, 200, 'Compra fornecedor', 'admin'),
(3, 'saida', 20, 320, 300, 'Venda cliente', 'vendedor1'),
(4, 'entrada', 25, 75, 100, 'Reposição estoque', 'admin');

-- Views úteis
-- View para produtos com baixo estoque
CREATE VIEW view_produtos_baixo_estoque AS
SELECT 
    p.id,
    p.codigo,
    p.nome,
    e.quantidade_atual,
    e.quantidade_minima,
    e.localizacao,
    (e.quantidade_minima - e.quantidade_atual) AS deficit
FROM produtos p
JOIN estoque e ON p.id = e.produto_id
WHERE e.quantidade_atual <= e.quantidade_minima
AND p.status = 'ativo';

-- View para relatório de estoque completo
CREATE VIEW view_relatorio_estoque AS
SELECT 
    p.id,
    p.codigo,
    p.nome,
    c.nome AS categoria,
    e.quantidade_atual,
    e.quantidade_minima,
    e.quantidade_maxima,
    e.localizacao,
    e.valor_custo,
    (e.quantidade_atual * e.valor_custo) AS valor_total_estoque,
    e.status,
    e.data_atualizacao
FROM produtos p
JOIN estoque e ON p.id = e.produto_id
JOIN categorias c ON p.categoria_id = c.id
WHERE p.status = 'ativo';

-- Procedures úteis
DELIMITER //

-- Procedure para dar entrada no estoque
CREATE PROCEDURE EntradaEstoque(
    IN p_produto_id INT,
    IN p_quantidade INT,
    IN p_motivo VARCHAR(255),
    IN p_usuario VARCHAR(100),
    IN p_valor_custo DECIMAL(10,2)
)
BEGIN
    DECLARE v_quantidade_atual INT DEFAULT 0;
    
    -- Buscar quantidade atual
    SELECT quantidade_atual INTO v_quantidade_atual 
    FROM estoque WHERE produto_id = p_produto_id;
    
    -- Atualizar estoque
    UPDATE estoque 
    SET quantidade_atual = quantidade_atual + p_quantidade,
        valor_custo = COALESCE(p_valor_custo, valor_custo),
        data_atualizacao = CURRENT_TIMESTAMP
    WHERE produto_id = p_produto_id;
    
    -- Registrar movimentação
    INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, usuario_responsavel)
    VALUES (p_produto_id, 'entrada', p_quantidade, v_quantidade_atual, v_quantidade_atual + p_quantidade, p_motivo, p_usuario);
END //

-- Procedure para dar saída no estoque
CREATE PROCEDURE SaidaEstoque(
    IN p_produto_id INT,
    IN p_quantidade INT,
    IN p_motivo VARCHAR(255),
    IN p_usuario VARCHAR(100)
)
BEGIN
    DECLARE v_quantidade_atual INT DEFAULT 0;
    
    -- Buscar quantidade atual
    SELECT quantidade_atual INTO v_quantidade_atual 
    FROM estoque WHERE produto_id = p_produto_id;
    
    -- Verificar se há estoque suficiente
    IF v_quantidade_atual >= p_quantidade THEN
        -- Atualizar estoque
        UPDATE estoque 
        SET quantidade_atual = quantidade_atual - p_quantidade,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE produto_id = p_produto_id;
        
        -- Registrar movimentação
        INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, usuario_responsavel)
        VALUES (p_produto_id, 'saida', p_quantidade, v_quantidade_atual, v_quantidade_atual - p_quantidade, p_motivo, p_usuario);
    ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estoque insuficiente para esta operação';
    END IF;
END //

-- Procedure para ajuste de estoque
CREATE PROCEDURE AjusteEstoque(
    IN p_produto_id INT,
    IN p_nova_quantidade INT,
    IN p_motivo VARCHAR(255),
    IN p_usuario VARCHAR(100)
)
BEGIN
    DECLARE v_quantidade_atual INT DEFAULT 0;
    DECLARE v_diferenca INT DEFAULT 0;
    
    -- Buscar quantidade atual
    SELECT quantidade_atual INTO v_quantidade_atual 
    FROM estoque WHERE produto_id = p_produto_id;
    
    SET v_diferenca = p_nova_quantidade - v_quantidade_atual;
    
    -- Atualizar estoque
    UPDATE estoque 
    SET quantidade_atual = p_nova_quantidade,
        data_atualizacao = CURRENT_TIMESTAMP
    WHERE produto_id = p_produto_id;
    
    -- Registrar movimentação
    INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, usuario_responsavel)
    VALUES (p_produto_id, 'ajuste', v_diferenca, v_quantidade_atual, p_nova_quantidade, p_motivo, p_usuario);
END //

-- Procedure para verificar produtos com baixo estoque
CREATE PROCEDURE VerificarBaixoEstoque()
BEGIN
    SELECT * FROM view_produtos_baixo_estoque
    ORDER BY deficit DESC;
END //

DELIMITER ;

-- Triggers para automatizar algumas operações
DELIMITER //

-- Trigger para criar registro de estoque quando um produto é inserido
CREATE TRIGGER trigger_criar_estoque_produto
AFTER INSERT ON produtos
FOR EACH ROW
BEGIN
    INSERT INTO estoque (produto_id, quantidade_atual, quantidade_minima, quantidade_maxima, localizacao)
    VALUES (NEW.id, 0, 10, 1000, 'A definir');
END //

DELIMITER ;"""

with open('ESTOQUE.SQL', 'w', encoding='utf-8') as f:
    f.write(estoque_sql)

print("Arquivo ESTOQUE.SQL criado com sucesso!")