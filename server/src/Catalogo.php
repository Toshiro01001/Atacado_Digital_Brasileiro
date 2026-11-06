<?php
declare(strict_types=1);

final class Catalogo
{
    public function __construct(private Banco $banco)
    {
    }

    public function departamentos(): array
    {
        $linhas = $this->banco->linhas(
            'SELECT d.slug, d.nome, d.descricao, COUNT(v.id) AS produtos
             FROM departamentos d LEFT JOIN vw_catalogo v ON v.departamento_slug = d.slug
             WHERE d.ativo = 1 GROUP BY d.id, d.slug, d.nome, d.descricao ORDER BY d.id'
        );
        foreach ($linhas as &$l) {
            $l['produtos'] = (int) $l['produtos'];
        }
        return $linhas;
    }

    public function listar(array $filtro): array
    {
        $onde = [];
        $params = [];
        if (is_string($filtro['departamento'] ?? null) && $filtro['departamento'] !== '') {
            $onde[] = 'departamento_slug = ?';
            $params[] = $filtro['departamento'];
        }
        if (is_string($filtro['busca'] ?? null) && trim($filtro['busca']) !== '') {
            $onde[] = "busca LIKE ? ESCAPE '!'";
            $params[] = '%' . self::padraoBusca($filtro['busca']) . '%';
        }
        $where = $onde ? 'WHERE ' . implode(' AND ', $onde) : '';
        $sql = "SELECT id, codigo, nome, descricao, marca, unidade, qtd_minima, departamento_slug, departamento, estoque, estoque_minimo
                FROM vw_catalogo {$where} ORDER BY codigo";
        $produtos = array_map([$this, 'tipar'], $this->banco->linhas($sql, $params));
        if (!$produtos) {
            return [];
        }
        $faixas = [];
        foreach ($this->banco->linhas('SELECT produto_id, qtd_inicial, preco_centavos FROM faixas_preco ORDER BY produto_id, qtd_inicial') as $f) {
            $faixas[(int) $f['produto_id']][] = ['qtd_inicial' => (int) $f['qtd_inicial'], 'preco_centavos' => (int) $f['preco_centavos']];
        }
        foreach ($produtos as &$p) {
            $p['faixas'] = $faixas[$p['id']] ?? [];
        }
        return $produtos;
    }

    public function obter(int $id): array
    {
        $p = $this->banco->linha(
            'SELECT id, codigo, nome, descricao, marca, unidade, qtd_minima, departamento_slug, departamento, estoque, estoque_minimo
             FROM vw_catalogo WHERE id = ?',
            [$id]
        );
        if (!$p) {
            throw new ErroApi(404, 'nao_encontrado', 'Produto não encontrado.');
        }
        $p = $this->tipar($p);
        $p['faixas'] = array_map(
            fn ($f) => ['qtd_inicial' => (int) $f['qtd_inicial'], 'preco_centavos' => (int) $f['preco_centavos']],
            $this->banco->linhas('SELECT qtd_inicial, preco_centavos FROM faixas_preco WHERE produto_id = ? ORDER BY qtd_inicial', [$id])
        );
        return $p;
    }

    /** Cadastro de produto pelo gestor, com faixas e estoque zerado, em uma transação. */
    public function criar(array $d): array
    {
        $codigo = is_string($d['codigo'] ?? null) ? trim($d['codigo']) : '';
        $nome = is_string($d['nome'] ?? null) ? trim($d['nome']) : '';
        $slug = is_string($d['departamento'] ?? null) ? $d['departamento'] : '';
        $faixas = $d['faixas'] ?? null;
        $problemas = [];
        if ($codigo === '' || mb_strlen($codigo) > 20) {
            $problemas[] = 'codigo';
        }
        if ($nome === '' || mb_strlen($nome) > 150) {
            $problemas[] = 'nome';
        }
        if (!is_array($faixas) || !$faixas) {
            $problemas[] = 'faixas';
        } else {
            foreach ($faixas as $f) {
                if (!is_array($f) || !Http::inteiroPositivo($f['qtd_inicial'] ?? null) || !Http::inteiroPositivo($f['preco_centavos'] ?? null)) {
                    $problemas[] = 'faixas';
                    break;
                }
            }
            if (!in_array(1, array_column($faixas, 'qtd_inicial'), true)) {
                $problemas[] = 'faixas';
            }
        }
        $dep = $this->banco->linha('SELECT id FROM departamentos WHERE slug = ?', [$slug]);
        if (!$dep) {
            $problemas[] = 'departamento';
        }
        if ($problemas) {
            throw new ErroApi(422, 'dados_invalidos', 'Confira os campos do produto. A faixa inicial precisa começar em 1 unidade.', ['campos' => array_values(array_unique($problemas))]);
        }
        if ($this->banco->linha('SELECT id FROM produtos WHERE codigo = ?', [$codigo])) {
            throw new ErroApi(409, 'codigo_em_uso', 'Já existe um produto com este código.');
        }
        $id = $this->banco->transacao(function () use ($codigo, $nome, $d, $dep, $faixas) {
            $this->banco->executar(
                'INSERT INTO produtos (codigo, nome, busca, departamento_id, marca) VALUES (?, ?, ?, ?, ?)',
                [$codigo, $nome, self::normalizar($codigo . ' ' . $nome), $dep['id'], is_string($d['marca'] ?? null) ? $d['marca'] : null]
            );
            $id = (int) $this->banco->pdo->lastInsertId();
            foreach ($faixas as $f) {
                $this->banco->executar('INSERT INTO faixas_preco (produto_id, qtd_inicial, preco_centavos) VALUES (?, ?, ?)', [$id, $f['qtd_inicial'], $f['preco_centavos']]);
            }
            $this->banco->executar('INSERT INTO estoque (produto_id) VALUES (?)', [$id]);
            return $id;
        });
        return $this->obter($id);
    }

    public static function normalizar(string $texto): string
    {
        $t = mb_strtolower($texto);
        return strtr($t, [
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i',
            'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ü' => 'u', 'ç' => 'c',
        ]);
    }

    /** % e _ digitados pelo usuário são tratados como texto, não como curinga. */
    public static function padraoBusca(string $texto): string
    {
        return strtr(self::normalizar(trim($texto)), ['!' => '!!', '%' => '!%', '_' => '!_']);
    }

    private function tipar(array $p): array
    {
        foreach (['id', 'qtd_minima', 'estoque', 'estoque_minimo'] as $c) {
            $p[$c] = (int) $p[$c];
        }
        return $p;
    }
}
