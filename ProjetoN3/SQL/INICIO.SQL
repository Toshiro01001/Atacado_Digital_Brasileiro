# Criando o arquivo de inicialização do banco de dados
init_sql =  INICIALIZAÇÃO DO BANCO DE DADOS
-- Sistema de Atacado Digital do Brasil
-- Execute este arquivo primeiro para criar o banco e as estruturas básicas

-- Criar o banco de dados
CREATE DATABASE IF NOT EXISTS atacado_digital;
USE atacado_digital;

-- Configurações do banco
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


-- Tabela de Administradores do Sistema
CREATE TABLE administradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    nivel_acesso ENUM('super', 'admin', 'moderador') DEFAULT 'admin',
    status ENUM('ativo', 'inativo') DEFAULT 'ativo',
    ultimo_login TIMESTAMP NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir administrador padrão
INSERT INTO administradores (usuario, senha, nome, email, nivel_acesso) VALUES
('admin', 'admin123', 'Administrador do Sistema', 'admin@atacadobrasil.com', 'super');

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

SELECT 'Banco de dados inicializado com sucesso!' AS status;
SELECT 'Execute os demais arquivos SQL na ordem indicada nas instruções.' AS proximo_passo;"""

with open('INIT_DATABASE.SQL', 'w', encoding='utf-8') as f:
    f.write(init_sql)

print("Arquivo INIT_DATABASE.SQL criado com sucesso!")
print("\n=== RESUMO DOS ARQUIVOS CRIADOS ===")
print("✅ CADASTRO.SQL - Cadastro de clientes (corrigido)")
print("✅ ESTOQUE.SQL - Controle de estoque (criado)")
print("✅ FUNCIONARIOS.SQL - Cadastro de funcionários (criado)")
print("✅ FORNECEDORES.SQL - Cadastro de fornecedores (criado)")
print("✅ painel.html - Painel administrativo (corrigido)")
print("✅ INIT_DATABASE.SQL - Inicialização do banco (criado)")