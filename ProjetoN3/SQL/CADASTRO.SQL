
cadastro_sql = Banco de Dados: CADASTRO.SQL

USE atacado_digital;

-- Tabela de Cadastro de Clientes
CREATE TABLE cadastro (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    telefone VARCHAR(15),
    data_nascimento DATE,
    endereco VARCHAR(255),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    cep VARCHAR(9),
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Índices para otimização
CREATE INDEX idx_email ON cadastro(email);
CREATE INDEX idx_cpf ON cadastro(cpf);
CREATE INDEX idx_status ON cadastro(status);

-- Inserir alguns dados de exemplo
INSERT INTO cadastro (nome, email, senha, cpf, telefone, data_nascimento, endereco, cidade, estado, cep) VALUES
('João Silva', 'joao.silva@email.com', 'senha123', '123.456.789-00', '(11) 9999-9999', '1985-03-15', 'Rua das Flores, 123', 'São Paulo', 'SP', '01234-567'),
('Maria Santos', 'maria.santos@email.com', 'senha456', '987.654.321-00', '(21) 8888-8888', '1990-07-22', 'Av. Principal, 456', 'Rio de Janeiro', 'RJ', '20123-456'),
('Pedro Oliveira', 'pedro.oliveira@email.com', 'senha789', '456.789.123-00', '(31) 7777-7777', '1988-12-10', 'Rua Central, 789', 'Belo Horizonte', 'MG', '30123-789');

-- Procedures úteis
DELIMITER //

-- Procedure para inserir novo cliente
CREATE PROCEDURE InserirCliente(
    IN p_nome VARCHAR(100),
    IN p_email VARCHAR(100),
    IN p_senha VARCHAR(255),
    IN p_cpf VARCHAR(14),
    IN p_telefone VARCHAR(15),
    IN p_data_nascimento DATE,
    IN p_endereco VARCHAR(255),
    IN p_cidade VARCHAR(100),
    IN p_estado VARCHAR(2),
    IN p_cep VARCHAR(9)
)
BEGIN
    INSERT INTO cadastro (nome, email, senha, cpf, telefone, data_nascimento, endereco, cidade, estado, cep)
    VALUES (p_nome, p_email, p_senha, p_cpf, p_telefone, p_data_nascimento, p_endereco, p_cidade, p_estado, p_cep);
END //

-- Procedure para autenticar cliente
CREATE PROCEDURE AutenticarCliente(
    IN p_email VARCHAR(100),
    IN p_senha VARCHAR(255)
)
BEGIN
    SELECT id, nome, email FROM cadastro 
    WHERE email = p_email AND senha = p_senha AND status = 'ativo';
END //

DELIMITER ;"""

with open('CADASTRO.SQL', 'w', encoding='utf-8') as f:
    f.write(cadastro_sql)

print("Arquivo CADASTRO.SQL criado com sucesso!")