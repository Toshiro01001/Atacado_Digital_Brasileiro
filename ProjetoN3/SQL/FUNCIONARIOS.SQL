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
    valor_entrada DECIMAL(10,2),
    observacoes TEXT,
    status ENUM('disponivel', 'reservado', 'vencido', 'bloqueado') DEFAULT 'disponivel',
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
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
    documento VARCHAR(100),
    responsavel VARCHAR(100),
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

-- Índices para otimização
CREATE INDEX idx_produto_estoque ON estoque(produto_id);
CREATE INDEX idx_status_estoque ON estoque(status);
CREATE INDEX idx_produto_movimentacao ON movimentacao_estoque(produto_id);
CREATE INDEX idx_tipo_movimentacao ON movimentacao_estoque(tipo_movimentacao);
CREATE INDEX idx_data_movimentacao ON movimentacao_estoque(data_movimentacao);

-- Inserir dados iniciais de estoque para os produtos já cadastrados
INSERT INTO estoque (produto_id, quantidade_atual, quantidade_minima, quantidade_maxima, localizacao, data_entrada, valor_entrada) VALUES
(1, 150, 20, 500, 'Setor A - Prateleira 1', CURDATE(), 10.00),
(2, 200, 30, 600, 'Setor A - Prateleira 2', CURDATE(), 5.50),
(3, 300, 50, 1000, 'Setor B - Prateleira 1', CURDATE(), 2.00),
(4, 100, 25, 400, 'Setor B - Prateleira 2', CURDATE(), 7.50),
(5, 80, 10, 200, 'Setor C - Prateleira 1', CURDATE(), 15.00),
(6, 500, 100, 2000, 'Setor C - Prateleira 2', CURDATE(), 1.20),
(7, 120, 50, 500, 'Setor D - Prateleira 1', CURDATE(), 3.80),
(8, 90, 30, 300, 'Setor D - Prateleira 2', CURDATE(), 10.50);

-- View para estoque com informações do produto
CREATE VIEW view_estoque_completo AS
SELECT 
    e.id,
    p.codigo,
    p.nome AS produto,
    p.marca,
    c.nome AS categoria,
    e.quantidade_atual,
    e.quantidade_minima,
    e.quantidade_maxima,
    e.localizacao,
    e.lote,
    e.data_validade,
    e.status,
    CASE 
        WHEN e.quantidade_atual <= e.quantidade_minima THEN 'Crítico'
        WHEN e.quantidade_atual <= (e.quantidade_minima * 1.5) THEN 'Baixo'
        ELSE 'Normal'
    END AS nivel_estoque,
    e.data_atualizacao
FROM estoque e
JOIN produtos p ON e.produto_id = p.id
JOIN categorias c ON p.categoria_id = c.id;

-- Triggers para controle automático
DELIMITER //

-- Trigger para registrar movimentação automática ao atualizar estoque
CREATE TRIGGER trigger_movimentacao_estoque
AFTER UPDATE ON estoque
FOR EACH ROW
BEGIN
    IF OLD.quantidade_atual != NEW.quantidade_atual THEN
        INSERT INTO movimentacao_estoque (
            produto_id, 
            tipo_movimentacao, 
            quantidade, 
            quantidade_anterior, 
            quantidade_atual, 
            motivo
        ) VALUES (
            NEW.produto_id,
            CASE 
                WHEN NEW.quantidade_atual > OLD.quantidade_atual THEN 'entrada'
                ELSE 'saida'
            END,
            ABS(NEW.quantidade_atual - OLD.quantidade_atual),
            OLD.quantidade_atual,
            NEW.quantidade_atual,
            'Atualização automática via sistema'
        );
    END IF;
END //

-- Procedures úteis
-- Procedure para dar entrada no estoque
CREATE PROCEDURE EntradaEstoque(
    IN p_produto_id INT,
    IN p_quantidade INT,
    IN p_motivo VARCHAR(255),
    IN p_documento VARCHAR(100),
    IN p_responsavel VARCHAR(100)
)
BEGIN
    DECLARE v_quantidade_atual INT DEFAULT 0;
    
    -- Buscar quantidade atual
    SELECT quantidade_atual INTO v_quantidade_atual 
    FROM estoque WHERE produto_id = p_produto_id;
    
    -- Atualizar estoque
    UPDATE estoque 
    SET quantidade_atual = quantidade_atual + p_quantidade
    WHERE produto_id = p_produto_id;
    
    -- Registrar movimentação
    INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, documento, responsavel)
    VALUES (p_produto_id, 'entrada', p_quantidade, v_quantidade_atual, v_quantidade_atual + p_quantidade, p_motivo, p_documento, p_responsavel);
END //

-- Procedure para dar saída no estoque
CREATE PROCEDURE SaidaEstoque(
    IN p_produto_id INT,
    IN p_quantidade INT,
    IN p_motivo VARCHAR(255),
    IN p_documento VARCHAR(100),
    IN p_responsavel VARCHAR(100)
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
        SET quantidade_atual = quantidade_atual - p_quantidade
        WHERE produto_id = p_produto_id;
        
        -- Registrar movimentação
        INSERT INTO movimentacao_estoque (produto_id, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_atual, motivo, documento, responsavel)
        VALUES (p_produto_id, 'saida', p_quantidade, v_quantidade_atual, v_quantidade_atual - p_quantidade, p_motivo, p_documento, p_responsavel);
    ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade insuficiente em estoque';
    END IF;
END //

-- Procedure para relatório de produtos com estoque baixo
CREATE PROCEDURE RelatorioEstoqueBaixo()
BEGIN
    SELECT * FROM view_estoque_completo
    WHERE quantidade_atual <= quantidade_minima
    ORDER BY nivel_estoque DESC, categoria, produto;
END //

DELIMITER ;