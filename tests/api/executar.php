<?php
declare(strict_types=1);
// Testes de ponta a ponta da API, sem framework: sobe o php -S de verdade e faz requisições HTTP.
// Uso: php tests/api/executar.php
// Para testar em MySQL: exporte ATACADO_DB=mysql e ATACADO_MYSQL_* antes de rodar.

$raiz = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . '/atacado-testes-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
$senhaGestor = bin2hex(random_bytes(10));
$senhaComprador = bin2hex(random_bytes(10));
$env = array_merge(getenv(), [
    'ATACADO_DATA_DIR' => $tmp,
    'ATACADO_SENHA_GESTOR' => $senhaGestor,
    'ATACADO_SENHA_COMPRADOR' => $senhaComprador,
    'PHP_CLI_SERVER_WORKERS' => '6',
]);
$saida = [];
$proc = proc_open([PHP_BINARY, "$raiz/server/bin/instalar.php", '--recriar'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $raiz, $env);
$saidaInstalar = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
if (proc_close($proc) !== 0) {
    exit("Falha ao instalar: $saidaInstalar\n");
}
$sock = stream_socket_server('tcp://127.0.0.1:0');
$porta = (int) substr(strrchr(stream_socket_get_name($sock, false), ':'), 1);
fclose($sock);
$log = "$tmp/php-server.log";
$servidor = proc_open([PHP_BINARY, '-S', "127.0.0.1:$porta", '-t', "$raiz/server/public", "$raiz/server/public/index.php"], [1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pp, $raiz, $env);
register_shutdown_function(function () use ($servidor, $tmp) {
    proc_terminate($servidor, 15);
    proc_close($servidor);
    exec('rm -rf ' . escapeshellarg($tmp));
});
$base = "http://127.0.0.1:$porta";

final class Cliente
{
    public string $cookie = '';
    public string $csrf = '';
    public function __construct(private string $base)
    {
    }
    public function req(string $metodo, string $rota, mixed $corpo = null, array $cab = [], ?string $bruto = null): array
    {
        $ch = curl_init($this->base . $rota);
        $h = $cab;
        if ($corpo !== null) {
            $h[] = 'Content-Type: application/json';
            $bruto = json_encode($corpo);
        }
        if ($this->csrf !== '') {
            $h[] = 'X-CSRF-Token: ' . $this->csrf;
        }
        $cabResp = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$cabResp) {
                $cabResp[] = trim($l);
                return strlen($l);
            },
        ]);
        if ($bruto !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bruto);
        }
        if ($this->cookie !== '') {
            curl_setopt($ch, CURLOPT_COOKIE, $this->cookie);
        }
        $r = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        foreach ($cabResp as $l) {
            if (stripos($l, 'Set-Cookie: atacado_sessao=') === 0 && !str_contains($l, 'atacado_sessao=deleted')) {
                $this->cookie = explode(';', substr($l, 12))[0];
            }
        }
        return ['status' => $status, 'json' => json_decode((string) $r, true), 'bruto' => $r, 'cab' => $cabResp];
    }
    public function login(string $email, string $senha): array
    {
        $r = $this->req('POST', '/api/login', ['email' => $email, 'senha' => $senha]);
        if ($r['status'] === 200) {
            $this->csrf = $r['json']['usuario']['csrf'];
        }
        return $r;
    }
}

$ok = 0;
$falhas = 0;
function t(string $nome, bool $cond, mixed $info = null): void
{
    global $ok, $falhas;
    if ($cond) {
        $ok++;
        echo "  ok    $nome\n";
    } else {
        $falhas++;
        echo "  FALHA $nome" . ($info !== null ? ' :: ' . json_encode($info, JSON_UNESCAPED_UNICODE) : '') . "\n";
    }
}

for ($i = 0; $i < 50; $i++) {
    if (@file_get_contents("$base/api/saude")) {
        break;
    }
    usleep(100000);
}

// Banco e esquema
require "$raiz/server/src/Banco.php";
$anon = new Cliente($base);
$r = $anon->req('GET', '/api/saude');
t('saude responde e informa o motor', $r['status'] === 200 && $r['json']['ok'] === true, $r);
echo "  motor: {$r['json']['motor']}\n";
t('divisor de script respeita ; em texto e comentário', Banco::dividirScript("INSERT INTO a VALUES ('x;y'); -- c;\nSELECT 1 /*! ; */;") === ["INSERT INTO a VALUES ('x;y')", 'SELECT 1 /*! ; */']);
$h = implode("\n", $r['cab']);
t('cabeçalhos de segurança presentes', str_contains($h, 'X-Content-Type-Options: nosniff') && str_contains($h, "default-src 'none'"));
t('rota inexistente devolve 404 em JSON', ($x = $anon->req('GET', '/api/nada'))['status'] === 404 && $x['json']['erro']['codigo'] === 'rota_inexistente');

// Catálogo
$r = $anon->req('GET', '/api/departamentos');
t('lista 4 departamentos', count($r['json']['departamentos']) === 4, $r['json']);
$r = $anon->req('GET', '/api/produtos');
t('lista 24 produtos com faixas', count($r['json']['produtos']) === 24 && count($r['json']['produtos'][0]['faixas']) === 3);
t('resposta não expoe custo nem hash', !str_contains($r['bruto'], 'custo') && !str_contains($r['bruto'], 'senha'));
$r = $anon->req('GET', '/api/produtos?departamento=limpeza');
t('filtra por departamento', count($r['json']['produtos']) === 6 && $r['json']['produtos'][0]['departamento_slug'] === 'limpeza');
$r = $anon->req('GET', '/api/produtos?busca=' . urlencode('AÇÚCAR'));
t('busca ignora acento e caixa', count($r['json']['produtos']) === 1 && $r['json']['produtos'][0]['codigo'] === 'ALI-004', $r['json']);
$r = $anon->req('GET', '/api/produtos?busca=' . urlencode('%'));
t('% na busca não vira curinga (so acha o produto com 70%)', count($r['json']['produtos']) === 1 && $r['json']['produtos'][0]['codigo'] === 'LIM-005', $r['json']);
$r = $anon->req('GET', '/api/produtos/3');
t('detalhe de produto', $r['status'] === 200 && $r['json']['produto']['codigo'] === 'ALI-003');
t('produto inexistente 404', $anon->req('GET', '/api/produtos/9999')['status'] === 404);

// Injeção de SQL
$total = count($anon->req('GET', '/api/produtos')['json']['produtos']);
foreach (["' OR '1'='1", "x'; DROP TABLE produtos; --", "x' UNION SELECT id,email,senha_hash,1,1,1,1,1,1,1,1 FROM usuarios --"] as $inj) {
    $r = $anon->req('GET', '/api/produtos?busca=' . urlencode($inj));
    t('injeção na busca não retorna nada: ' . substr($inj, 0, 22), $r['status'] === 200 && $r['json']['produtos'] === [], $r['json']);
    $r = $anon->req('GET', '/api/produtos?departamento=' . urlencode($inj));
    t('injeção no departamento não retorna nada: ' . substr($inj, 0, 22), $r['status'] === 200 && $r['json']['produtos'] === [], $r['json']);
}
t('injeção na rota de produto é recusada', $anon->req('GET', '/api/produtos/1%20OR%201=1')['status'] === 404);
$r = $anon->login("gestor@atacado.exemplo.invalid' OR '1'='1' -- ", 'x');
t('injeção no e-mail do login devolve 401', $r['status'] === 401, $r['json']);
$r = $anon->login('gestor@atacado.exemplo.invalid', "' OR '1'='1");
t('injeção na senha devolve 401', $r['status'] === 401, $r['json']);
t('tabela produtos continua intacta', count($anon->req('GET', '/api/produtos')['json']['produtos']) === $total);

// Login
$r = $anon->login('compras@mercadinho.exemplo.invalid', 'senha-errada');
t('senha errada devolve 401', $r['status'] === 401 && $r['json']['erro']['codigo'] === 'credenciais_invalidas', $r['json']);
$r2 = $anon->login('ninguem@exemplo.invalid', 'senha-errada');
t('e-mail inexistente devolve a mesma mensagem', $r2['status'] === 401 && $r2['json']['erro']['mensagem'] === $r['json']['erro']['mensagem']);
t('login sem JSON devolve 415', $anon->req('POST', '/api/login', null, ['Content-Type: application/x-www-form-urlencoded'], 'email=a&senha=b')['status'] === 415);
t('rota protegida sem sessão devolve 401', $anon->req('GET', '/api/pedidos')['status'] === 401);
t('escrita sem sessão devolve 401', $anon->req('POST', '/api/pedidos', ['itens' => []])['status'] === 401);
$bruta = new Cliente($base);
for ($i = 0; $i < 5; $i++) {
    $bruta->login('alvo@exemplo.invalid', 'tentativa' . $i);
}
t('sexta tentativa errada é bloqueada com 429', $bruta->login('alvo@exemplo.invalid', 'tentativa6')['status'] === 429);

$comprador = new Cliente($base);
$r = $comprador->login('compras@mercadinho.exemplo.invalid', $senhaComprador);
t('comprador entra com a senha certa', $r['status'] === 200 && $r['json']['usuario']['papel'] === 'comprador', $r['json']);
t('resposta do login não traz hash', !str_contains($r['bruto'], 'senha_hash') && !str_contains($r['bruto'], '$2y$'));
$ck = implode("\n", $r['cab']);
t('cookie de sessão HttpOnly e SameSite=Strict', stripos($ck, 'httponly') !== false && stripos($ck, 'samesite=strict') !== false, $ck);
$outro = new Cliente($base);
$outro->login('compras@padaria.exemplo.invalid', $senhaComprador);
$gestor = new Cliente($base);
t('gestor entra', $gestor->login('gestor@atacado.exemplo.invalid', $senhaGestor)['status'] === 200);

// Pedido: regras
$sem = clone $comprador;
$sem->csrf = '';
t('escrita sem token CSRF devolve 403', $sem->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => 10]]])['json']['erro']['codigo'] === 'csrf_invalido');
$sem->csrf = 'token-falso';
t('token CSRF falso devolve 403', $sem->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => 10]]])['status'] === 403);
t('comprador não vê painel do gestor (403)', $comprador->req('GET', '/api/gestor/resumo')['status'] === 403);
t('comprador não cria produto (403)', $comprador->req('POST', '/api/produtos', ['codigo' => 'X'])['status'] === 403);
t('comprador não muda status (403)', $comprador->req('PATCH', '/api/pedidos/1', ['status' => 'cancelado'])['status'] === 403);
$estoque = fn (int $id) => $anon->req('GET', "/api/produtos/$id")['json']['produto']['estoque'];
$antes = $estoque(1);
$r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => 2]]]);
t('abaixo do pedido mínimo devolve 422', $r['status'] === 422 && $r['json']['erro']['codigo'] === 'abaixo_pedido_minimo', $r['json']);
t('e não baixa estoque (rollback)', $estoque(1) === $antes);
$r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => 1]]]);
t('abaixo da quantidade minima do produto devolve 422', $r['status'] === 422 && $r['json']['erro']['codigo'] === 'abaixo_do_minimo', $r['json']);
foreach ([0, -5, 1.5, '10', null] as $ruim) {
    $r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => $ruim]]]);
    t('quantidade inválida recusada: ' . json_encode($ruim), $r['status'] === 422, $r['json']);
}
$antes2 = $estoque(2);
$r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 2, 'quantidade' => 10], ['produto_id' => 1, 'quantidade' => 99999]]]);
t('estoque insuficiente devolve 409', $r['status'] === 409 && $r['json']['erro']['codigo'] === 'estoque_insuficiente', $r['json']);
t('falha em um item desfaz o pedido inteiro', $estoque(2) === $antes2 && $estoque(1) === $antes);
$r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 9999, 'quantidade' => 10]]]);
t('produto inexistente no pedido devolve 404', $r['status'] === 404);

// Pedido: caminho feliz com preço por faixa
$a1 = $estoque(1);
$a6 = $estoque(6);
$r = $comprador->req('POST', '/api/pedidos', ['itens' => [['produto_id' => 1, 'quantidade' => 10], ['produto_id' => 6, 'quantidade' => 2], ['produto_id' => 1, 'quantidade' => 2]], 'observacao' => "<script>alert('x')</script>"]);
t('pedido válido devolve 201', $r['status'] === 201, $r['json']);
$ped = $r['json']['pedido'];
$l1 = array_values(array_filter($ped['linhas'], fn ($l) => $l['produto_id'] === 1))[0];
t('itens repetidos são somados e pegam a faixa de 10+', $l1['quantidade'] === 12 && $l1['preco_unit_centavos'] === 4310, $l1);
t('total confere com a soma dos itens', $ped['total_centavos'] === array_sum(array_column($ped['linhas'], 'total_centavos')));
t('estoque baixou', $estoque(1) === $a1 - 12 && $estoque(6) === $a6 - 2);
t('observação fica como texto', $ped['observacao'] === "<script>alert('x')</script>");
$pid = $ped['id'];
t('cliente vê o proprio pedido', $comprador->req('GET', "/api/pedidos/$pid")['status'] === 200);
t('outro cliente não vê o pedido (404)', $outro->req('GET', "/api/pedidos/$pid")['status'] === 404);
t('listagem do comprador só tem pedidos dele', array_unique(array_column($comprador->req('GET', '/api/pedidos')['json']['pedidos'], 'cliente_id')) === [1]);
t('gestor vê tudo', count(array_unique(array_column($gestor->req('GET', '/api/pedidos')['json']['pedidos'], 'cliente_id'))) > 1);

// Gestor
$r = $gestor->req('GET', '/api/gestor/resumo');
t('resumo traz faturamento, estoque baixo e fornecedores', count($r['json']['faturamento_por_departamento']) === 4 && count($r['json']['estoque_baixo']) >= 1 && count($r['json']['fornecedores']) === 5, $r['json']);
$r = $gestor->req('PATCH', "/api/pedidos/$pid", ['status' => 'entregue']);
t('transição inválida de status devolve 409', $r['status'] === 409, $r['json']);
$a1 = $estoque(1);
$r = $gestor->req('PATCH', "/api/pedidos/$pid", ['status' => 'cancelado']);
t('cancelar pedido', $r['status'] === 200 && $r['json']['pedido']['status'] === 'cancelado', $r['json']);
t('cancelar devolve o estoque', $estoque(1) === $a1 + 12);
t('cancelar de novo é recusado', $gestor->req('PATCH', "/api/pedidos/$pid", ['status' => 'cancelado'])['status'] === 409);
t('estoque não volta duas vezes', $estoque(1) === $a1 + 12);
$a9 = $estoque(9);
$r = $gestor->req('POST', '/api/gestor/estoque/9/entrada', ['quantidade' => 50]);
t('entrada de reposição soma ao estoque', $r['status'] === 200 && $estoque(9) === $a9 + 50, $r['json']);
$r = $gestor->req('POST', '/api/produtos', ['codigo' => 'TST-001', 'nome' => "Produto de teste d'água", 'departamento' => 'limpeza', 'faixas' => [['qtd_inicial' => 1, 'preco_centavos' => 1000], ['qtd_inicial' => 10, 'preco_centavos' => 900]]]);
t('gestor cria produto com faixas', $r['status'] === 201 && count($r['json']['produto']['faixas']) === 2, $r['json']);
t('codigo repetido devolve 409', $gestor->req('POST', '/api/produtos', ['codigo' => 'TST-001', 'nome' => 'x', 'departamento' => 'limpeza', 'faixas' => [['qtd_inicial' => 1, 'preco_centavos' => 1000]]])['status'] === 409);
t('produto sem faixa inicial 1 devolve 422', $gestor->req('POST', '/api/produtos', ['codigo' => 'TST-002', 'nome' => 'x', 'departamento' => 'limpeza', 'faixas' => [['qtd_inicial' => 5, 'preco_centavos' => 1000]]])['status'] === 422);

// Concorrência: varias compras ao mesmo tempo do último saldo não podem vender a mais
$gestor->req('POST', '/api/produtos', ['codigo' => 'TST-003', 'nome' => 'Produto concorrido', 'departamento' => 'limpeza', 'faixas' => [['qtd_inicial' => 1, 'preco_centavos' => 10000]]]);
$conc = $anon->req('GET', '/api/produtos?busca=' . urlencode('concorrido'))['json']['produtos'][0];
$cid = $conc['id'];
// Produto novo ainda não tem fornecedor: liga direto no banco só para este teste.
putenv("ATACADO_DATA_DIR=$tmp");
$b = new Banco();
$b->executar('INSERT INTO fornecedor_produtos (fornecedor_id, produto_id, preco_compra_centavos) VALUES (2, ?, 100)', [$cid]);
$gestor->req('POST', "/api/gestor/estoque/$cid/entrada", ['quantidade' => 12]);
$mh = curl_multi_init();
$hs = [];
for ($i = 0; $i < 8; $i++) {
    $ch = curl_init("$base/api/pedidos");
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIE => $comprador->cookie,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-CSRF-Token: ' . $comprador->csrf],
        CURLOPT_POSTFIELDS => json_encode(['itens' => [['produto_id' => $cid, 'quantidade' => 3]]]),
    ]);
    curl_multi_add_handle($mh, $ch);
    $hs[] = $ch;
}
do {
    curl_multi_exec($mh, $rodando);
    curl_multi_select($mh, 0.2);
} while ($rodando);
$codigos = array_map(fn ($c) => curl_getinfo($c, CURLINFO_RESPONSE_CODE), $hs);
$vendidos = count(array_filter($codigos, fn ($c) => $c === 201));
$recusados = count(array_filter($codigos, fn ($c) => $c === 409));
t('8 compras simultâneas de 3 com saldo 12: 4 vendem e 4 recebem 409', $vendidos === 4 && $recusados === 4, $codigos);
t('saldo final zerado, nunca negativo', $estoque($cid) === 0, $estoque($cid));

// Sessao
$r = $comprador->req('POST', '/api/logout');
t('logout', $r['status'] === 200);
$comprador->csrf = '';
t('depois do logout a sessão não vale mais', $comprador->req('GET', '/api/eu')['status'] === 401);

$serverLog = is_file($log) ? (string) file_get_contents($log) : '';
t('nenhum erro interno registrado no log do servidor', !str_contains($serverLog, '[atacado]'), substr($serverLog, 0, 400));

echo "\nResultado: $ok ok, $falhas falhas\n";
exit($falhas ? 1 : 0);
