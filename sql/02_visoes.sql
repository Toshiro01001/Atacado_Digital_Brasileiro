-- Visões usadas pelas duas camadas (navegador e PHP). SQL comum aos dois bancos.

CREATE VIEW vw_catalogo AS
SELECT p.id, p.codigo, p.nome, p.descricao, p.busca, p.marca, p.unidade, p.qtd_minima,
       d.slug AS departamento_slug, d.nome AS departamento,
       e.quantidade_atual AS estoque, e.quantidade_minima AS estoque_minimo
FROM produtos p
JOIN departamentos d ON d.id = p.departamento_id
JOIN estoque e ON e.produto_id = p.id
WHERE p.ativo = 1;

CREATE VIEW vw_estoque_baixo AS
SELECT p.id, p.codigo, p.nome, d.nome AS departamento, p.unidade,
       e.quantidade_atual, e.quantidade_minima, e.quantidade_maxima, e.localizacao,
       e.quantidade_maxima - e.quantidade_atual AS reposicao_sugerida,
       (SELECT fp.fornecedor_id FROM fornecedor_produtos fp
         WHERE fp.produto_id = p.id
         ORDER BY fp.preco_compra_centavos, fp.fornecedor_id LIMIT 1) AS fornecedor_id
FROM produtos p
JOIN departamentos d ON d.id = p.departamento_id
JOIN estoque e ON e.produto_id = p.id
WHERE p.ativo = 1 AND e.quantidade_atual <= e.quantidade_minima;

CREATE VIEW vw_faturamento_departamento AS
SELECT d.id, d.nome AS departamento,
       COALESCE(SUM(CASE WHEN ped.id IS NOT NULL THEN i.total_centavos END), 0) AS faturado_centavos,
       COUNT(DISTINCT ped.id) AS pedidos,
       COALESCE(SUM(CASE WHEN ped.id IS NOT NULL THEN i.quantidade END), 0) AS volumes
FROM departamentos d
LEFT JOIN produtos p ON p.departamento_id = d.id
LEFT JOIN pedido_itens i ON i.produto_id = p.id
LEFT JOIN pedidos ped ON ped.id = i.pedido_id AND ped.status <> 'cancelado'
GROUP BY d.id, d.nome;

CREATE VIEW vw_fornecedores_resumo AS
SELECT f.id, f.codigo, f.razao_social, f.documento_ficticio, f.tipo, f.cidade, f.uf, f.contato,
       f.prazo_pagamento_dias,
       (SELECT COUNT(*) FROM fornecedor_produtos fp WHERE fp.fornecedor_id = f.id) AS produtos,
       (SELECT MIN(fp.prazo_entrega_dias) FROM fornecedor_produtos fp WHERE fp.fornecedor_id = f.id) AS prazo_entrega_dias,
       (SELECT COALESCE(SUM(c.total_centavos), 0) FROM compras_fornecedor c WHERE c.fornecedor_id = f.id) AS comprado_centavos
FROM fornecedores f
WHERE f.ativo = 1;

CREATE VIEW vw_pedidos_resumo AS
SELECT ped.id, ped.cliente_id, c.razao_social AS cliente, ped.usuario_id, ped.status, ped.total_centavos,
       ped.observacao, ped.criado_em,
       (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = ped.id) AS itens
FROM pedidos ped
JOIN clientes c ON c.id = ped.cliente_id;
