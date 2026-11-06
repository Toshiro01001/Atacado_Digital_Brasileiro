<?php
declare(strict_types=1);

final class Pedidos
{
    public const PROXIMOS = [
        'novo' => ['separacao', 'cancelado'],
        'separacao' => ['faturado', 'cancelado'],
        'faturado' => ['entregue', 'cancelado'],
        'entregue' => [],
        'cancelado' => [],
    ];

    public function __construct(private Banco $banco)
    {
    }

    public function criar(array $usuario, array $dados): array
    {
        $clienteId = $usuario['cliente_id'] === null ? null : (int) $usuario['cliente_id'];
        if ($clienteId === null) {
            throw new ErroApi(403, 'sem_cliente', 'Este usuário não está ligado a um cliente. Entre como comprador.');
        }
        $itens = $this->validarItens($dados['itens'] ?? null);
        $observacao = is_string($dados['observacao'] ?? null) ? trim($dados['observacao']) : null;
        if ($observacao !== null && mb_strlen($observacao) > 500) {
            throw new ErroApi(422, 'dados_invalidos', 'A observação aceita até 500 caracteres.');
        }

        $id = $this->banco->transacao(function () use ($usuario, $clienteId, $itens, $observacao) {
            $this->banco->executar(
                'INSERT INTO pedidos (cliente_id, usuario_id, observacao, criado_em) VALUES (?, ?, ?, ?)',
                [$clienteId, $usuario['id'], $observacao ?: null, gmdate('Y-m-d H:i:s')]
            );
            $pedidoId = (int) $this->banco->pdo->lastInsertId();
            $documento = self::numero($pedidoId);
            $total = 0;
            // Ordem fixa por produto: duas compras simultâneas não travam uma à outra.
            ksort($itens);
            foreach ($itens as $produtoId => $quantidade) {
                $p = $this->banco->linha('SELECT id, nome, qtd_minima FROM vw_catalogo WHERE id = ?', [$produtoId]);
                if (!$p) {
                    throw new ErroApi(404, 'produto_inexistente', "O produto {$produtoId} não existe ou está inativo.");
                }
                if ($quantidade < (int) $p['qtd_minima']) {
                    throw new ErroApi(422, 'abaixo_do_minimo', "{$p['nome']}: a quantidade mínima é {$p['qtd_minima']}.");
                }
                $preco = (int) ($this->banco->linha(
                    'SELECT preco_centavos FROM faixas_preco WHERE produto_id = ? AND qtd_inicial <= ? ORDER BY qtd_inicial DESC LIMIT 1',
                    [$produtoId, $quantidade]
                )['preco_centavos'] ?? 0);
                if ($preco <= 0) {
                    throw new ErroApi(409, 'sem_preco', "{$p['nome']}: sem preço para esta quantidade.");
                }
                // Baixa condicional: só desconta se ainda houver saldo. Não existe "li e depois gravei".
                $baixou = $this->banco->executar(
                    'UPDATE estoque SET quantidade_atual = quantidade_atual - ? WHERE produto_id = ? AND quantidade_atual >= ?',
                    [$quantidade, $produtoId, $quantidade]
                );
                if ($baixou !== 1) {
                    throw new ErroApi(409, 'estoque_insuficiente', "{$p['nome']}: estoque insuficiente para {$quantidade}.", ['produto_id' => $produtoId]);
                }
                $saldo = (int) $this->banco->linha('SELECT quantidade_atual FROM estoque WHERE produto_id = ?', [$produtoId])['quantidade_atual'];
                $linha = $preco * $quantidade;
                $total += $linha;
                $this->banco->executar(
                    'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unit_centavos, total_centavos) VALUES (?, ?, ?, ?, ?)',
                    [$pedidoId, $produtoId, $quantidade, $preco, $linha]
                );
                $this->registrarMovimento($produtoId, 'saida', $quantidade, $saldo + $quantidade, $saldo, 'Venda ao cliente', $documento, $usuario['email']);
            }
            $minimo = (int) $this->banco->linha("SELECT valor FROM configuracoes WHERE chave = 'pedido_minimo_centavos'")['valor'];
            if ($total < $minimo) {
                throw new ErroApi(422, 'abaixo_pedido_minimo', 'O pedido não atingiu o valor mínimo.', ['minimo_centavos' => $minimo, 'total_centavos' => $total]);
            }
            $this->banco->executar('UPDATE pedidos SET total_centavos = ? WHERE id = ?', [$total, $pedidoId]);
            return $pedidoId;
        });
        return $this->obter($usuario, $id);
    }

    public function listar(array $usuario): array
    {
        $sql = 'SELECT id, cliente_id, cliente, status, total_centavos, observacao, criado_em, itens FROM vw_pedidos_resumo';
        if ($usuario['papel'] === 'gestor') {
            $linhas = $this->banco->linhas($sql . ' ORDER BY id DESC LIMIT 200');
        } else {
            $linhas = $this->banco->linhas($sql . ' WHERE cliente_id = ? ORDER BY id DESC LIMIT 200', [$usuario['cliente_id']]);
        }
        return array_map([$this, 'tipar'], $linhas);
    }

    public function obter(array $usuario, int $id): array
    {
        $p = $this->banco->linha(
            'SELECT id, cliente_id, cliente, status, total_centavos, observacao, criado_em, itens FROM vw_pedidos_resumo WHERE id = ?',
            [$id]
        );
        // Pedido de outro cliente responde igual a pedido inexistente: não revela que ele existe.
        if (!$p || ($usuario['papel'] !== 'gestor' && (int) $p['cliente_id'] !== (int) $usuario['cliente_id'])) {
            throw new ErroApi(404, 'nao_encontrado', 'Pedido não encontrado.');
        }
        $p = $this->tipar($p);
        $p['numero'] = self::numero($p['id']);
        $p['linhas'] = array_map(
            fn ($i) => [
                'produto_id' => (int) $i['produto_id'], 'codigo' => $i['codigo'], 'nome' => $i['nome'],
                'quantidade' => (int) $i['quantidade'], 'preco_unit_centavos' => (int) $i['preco_unit_centavos'], 'total_centavos' => (int) $i['total_centavos'],
            ],
            $this->banco->linhas(
                'SELECT i.produto_id, p.codigo, p.nome, i.quantidade, i.preco_unit_centavos, i.total_centavos
                 FROM pedido_itens i JOIN produtos p ON p.id = i.produto_id WHERE i.pedido_id = ? ORDER BY p.codigo',
                [$id]
            )
        );
        return $p;
    }

    public function mudarStatus(array $gestor, int $id, array $dados): array
    {
        $novo = is_string($dados['status'] ?? null) ? $dados['status'] : '';
        $this->banco->transacao(function () use ($gestor, $id, $novo) {
            $atual = $this->banco->linha('SELECT status FROM pedidos WHERE id = ?', [$id]);
            if (!$atual) {
                throw new ErroApi(404, 'nao_encontrado', 'Pedido não encontrado.');
            }
            if (!in_array($novo, self::PROXIMOS[$atual['status']] ?? [], true)) {
                throw new ErroApi(409, 'transicao_invalida', "Um pedido em \"{$atual['status']}\" não pode ir para \"{$novo}\".");
            }
            // Condição no status: dois cancelamentos simultâneos não devolvem o estoque duas vezes.
            $mudou = $this->banco->executar('UPDATE pedidos SET status = ? WHERE id = ? AND status = ?', [$novo, $id, $atual['status']]);
            if ($mudou !== 1) {
                throw new ErroApi(409, 'transicao_invalida', 'O pedido mudou enquanto a alteração era feita. Atualize e tente de novo.');
            }
            if ($novo === 'cancelado') {
                foreach ($this->banco->linhas('SELECT produto_id, quantidade FROM pedido_itens WHERE pedido_id = ? ORDER BY produto_id', [$id]) as $item) {
                    $this->repor((int) $item['produto_id'], (int) $item['quantidade'], 'devolucao', 'Pedido cancelado', self::numero($id), $gestor['email']);
                }
            }
        });
        return $this->obter($gestor, $id);
    }

    public function repor(int $produtoId, int $quantidade, string $tipo, string $motivo, string $documento, string $responsavel): int
    {
        $this->banco->executar('UPDATE estoque SET quantidade_atual = quantidade_atual + ? WHERE produto_id = ?', [$quantidade, $produtoId]);
        $saldo = (int) $this->banco->linha('SELECT quantidade_atual FROM estoque WHERE produto_id = ?', [$produtoId])['quantidade_atual'];
        $this->registrarMovimento($produtoId, $tipo, $quantidade, $saldo - $quantidade, $saldo, $motivo, $documento, $responsavel);
        return $saldo;
    }

    public static function numero(int $id): string
    {
        return 'PED-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
    }

    private function registrarMovimento(int $produtoId, string $tipo, int $qtd, int $anterior, int $atual, string $motivo, string $documento, string $responsavel): void
    {
        $this->banco->executar(
            'INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, quantidade_anterior, quantidade_atual, motivo, documento, responsavel, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$produtoId, $tipo, $qtd, $anterior, $atual, $motivo, $documento, $responsavel, gmdate('Y-m-d H:i:s')]
        );
    }

    /** Junta itens repetidos e recusa quantidade que não seja inteiro positivo. */
    private function validarItens(mixed $itens): array
    {
        if (!is_array($itens) || !$itens || count($itens) > 100) {
            throw new ErroApi(422, 'dados_invalidos', 'Envie de 1 a 100 itens.');
        }
        $saida = [];
        foreach ($itens as $item) {
            $id = is_array($item) ? Http::inteiroPositivo($item['produto_id'] ?? null) : null;
            $qtd = is_array($item) ? Http::inteiroPositivo($item['quantidade'] ?? null) : null;
            if ($id === null || $qtd === null || $qtd > 1000000) {
                throw new ErroApi(422, 'dados_invalidos', 'Cada item precisa de produto_id e quantidade inteiros e positivos.');
            }
            $saida[$id] = ($saida[$id] ?? 0) + $qtd;
        }
        return $saida;
    }

    private function tipar(array $p): array
    {
        foreach (['id', 'cliente_id', 'total_centavos', 'itens'] as $c) {
            $p[$c] = (int) $p[$c];
        }
        return $p;
    }
}
