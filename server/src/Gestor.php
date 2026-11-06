<?php
declare(strict_types=1);

final class Gestor
{
    public function __construct(private Banco $banco, private Pedidos $pedidos)
    {
    }

    public function resumo(): array
    {
        return [
            'faturamento_por_departamento' => $this->inteiros(
                $this->banco->linhas('SELECT departamento, faturado_centavos, pedidos, volumes FROM vw_faturamento_departamento ORDER BY faturado_centavos DESC'),
                ['faturado_centavos', 'pedidos', 'volumes']
            ),
            'estoque_baixo' => $this->inteiros(
                $this->banco->linhas('SELECT id, codigo, nome, departamento, quantidade_atual, quantidade_minima, reposicao_sugerida, fornecedor_id FROM vw_estoque_baixo ORDER BY quantidade_atual - quantidade_minima'),
                ['id', 'quantidade_atual', 'quantidade_minima', 'reposicao_sugerida', 'fornecedor_id']
            ),
            'fornecedores' => $this->inteiros(
                $this->banco->linhas('SELECT id, codigo, razao_social, documento_ficticio, tipo, cidade, uf, contato, prazo_pagamento_dias, produtos, prazo_entrega_dias, comprado_centavos FROM vw_fornecedores_resumo ORDER BY comprado_centavos DESC'),
                ['id', 'prazo_pagamento_dias', 'produtos', 'prazo_entrega_dias', 'comprado_centavos']
            ),
        ];
    }

    public function entrada(array $gestor, int $produtoId, array $dados): array
    {
        $qtd = Http::inteiroPositivo($dados['quantidade'] ?? null);
        if ($qtd === null || $qtd > 1000000) {
            throw new ErroApi(422, 'dados_invalidos', 'A quantidade precisa ser um inteiro positivo.');
        }
        $fp = $this->banco->linha(
            'SELECT fornecedor_id, preco_compra_centavos FROM fornecedor_produtos WHERE produto_id = ? ORDER BY preco_compra_centavos, fornecedor_id LIMIT 1',
            [$produtoId]
        );
        if (!$fp) {
            throw new ErroApi(404, 'nao_encontrado', 'Produto sem fornecedor cadastrado.');
        }
        $saldo = $this->banco->transacao(function () use ($gestor, $produtoId, $qtd, $fp) {
            $this->banco->executar(
                'INSERT INTO compras_fornecedor (fornecedor_id, produto_id, quantidade, total_centavos, criado_em) VALUES (?, ?, ?, ?, ?)',
                [$fp['fornecedor_id'], $produtoId, $qtd, $qtd * (int) $fp['preco_compra_centavos'], gmdate('Y-m-d H:i:s')]
            );
            $compra = (int) $this->banco->pdo->lastInsertId();
            return $this->pedidos->repor($produtoId, $qtd, 'entrada', 'Reposição do fornecedor', 'COMPRA-' . $compra, $gestor['email']);
        });
        return ['produto_id' => $produtoId, 'quantidade_atual' => $saldo];
    }

    private function inteiros(array $linhas, array $campos): array
    {
        foreach ($linhas as &$l) {
            foreach ($campos as $c) {
                $l[$c] = $l[$c] === null ? null : (int) $l[$c];
            }
        }
        return $linhas;
    }
}
