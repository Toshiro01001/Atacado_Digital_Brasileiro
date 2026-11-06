<?php
declare(strict_types=1);

// Ponto de entrada único da API. Toda rota passa por aqui.
foreach (['ErroApi', 'Banco', 'Http', 'Autenticacao', 'Catalogo', 'Pedidos', 'Gestor'] as $classe) {
    require __DIR__ . '/../src/' . $classe . '.php';
}

ini_set('display_errors', '0');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rota = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/') ?: '/';

try {
    if ($rota === '/') {
        Http::responder(200, [
            'sistema' => 'Atacado Digital: sistema de demonstração com dados fictícios',
            'rotas' => [
                'GET /api/saude', 'GET /api/departamentos', 'GET /api/produtos?departamento=&busca=', 'GET /api/produtos/{id}',
                'POST /api/produtos', 'POST /api/login', 'POST /api/logout', 'GET /api/eu', 'GET /api/pedidos', 'POST /api/pedidos',
                'GET /api/pedidos/{id}', 'PATCH /api/pedidos/{id}', 'GET /api/gestor/resumo', 'POST /api/gestor/estoque/{id}/entrada',
            ],
        ]);
    }

    $banco = new Banco();
    if (!$banco->instalado()) {
        throw new ErroApi(503, 'nao_instalado', 'Banco ainda não instalado. Rode: php server/bin/instalar.php');
    }
    Autenticacao::iniciarSessao($rota === '/api/login');
    $auth = new Autenticacao($banco);
    $catalogo = new Catalogo($banco);
    $pedidos = new Pedidos($banco);
    $gestor = new Gestor($banco, $pedidos);

    // Toda escrita, menos o próprio login, exige token CSRF de quem já está logado.
    $escrita = in_array($metodo, ['POST', 'PATCH'], true);
    if ($escrita && $rota !== '/api/login') {
        $auth->exigirLogin();
        $auth->exigirCsrf();
    }

    $id = null;
    $rotaBase = $rota;
    if (preg_match('#^/api/(produtos|pedidos)/([1-9][0-9]{0,9})$#', $rota, $m)) {
        $rotaBase = "/api/{$m[1]}/:id";
        $id = (int) $m[2];
    } elseif (preg_match('#^/api/gestor/estoque/([1-9][0-9]{0,9})/entrada$#', $rota, $m)) {
        $rotaBase = '/api/gestor/estoque/:id/entrada';
        $id = (int) $m[1];
    }

    switch ("{$metodo} {$rotaBase}") {
        case 'GET /api/saude':
            Http::responder(200, ['ok' => true, 'motor' => $banco->motor]);
        case 'GET /api/departamentos':
            Http::responder(200, ['departamentos' => $catalogo->departamentos()]);
        case 'GET /api/produtos':
            Http::responder(200, ['produtos' => $catalogo->listar($_GET)]);
        case 'GET /api/produtos/:id':
            Http::responder(200, ['produto' => $catalogo->obter($id)]);
        case 'POST /api/produtos':
            $auth->exigirGestor();
            Http::responder(201, ['produto' => $catalogo->criar(Http::corpoJson())]);
        case 'POST /api/login':
            Http::responder(200, ['usuario' => $auth->entrar(Http::corpoJson())]);
        case 'POST /api/logout':
            $auth->sair();
            Http::responder(200, ['ok' => true]);
        case 'GET /api/eu':
            Http::responder(200, ['usuario' => $auth->publico($auth->exigirLogin())]);
        case 'GET /api/pedidos':
            Http::responder(200, ['pedidos' => $pedidos->listar($auth->exigirLogin())]);
        case 'POST /api/pedidos':
            Http::responder(201, ['pedido' => $pedidos->criar($auth->exigirLogin(), Http::corpoJson())]);
        case 'GET /api/pedidos/:id':
            Http::responder(200, ['pedido' => $pedidos->obter($auth->exigirLogin(), $id)]);
        case 'PATCH /api/pedidos/:id':
            Http::responder(200, ['pedido' => $pedidos->mudarStatus($auth->exigirGestor(), $id, Http::corpoJson())]);
        case 'GET /api/gestor/resumo':
            $auth->exigirGestor();
            Http::responder(200, $gestor->resumo());
        case 'POST /api/gestor/estoque/:id/entrada':
            Http::responder(200, $gestor->entrada($auth->exigirGestor(), $id, Http::corpoJson()));
    }
    throw new ErroApi(404, 'rota_inexistente', 'Rota não encontrada.');
} catch (ErroApi $e) {
    Http::responder($e->status, ['erro' => ['codigo' => $e->codigo, 'mensagem' => $e->getMessage(), 'detalhes' => $e->detalhes]]);
} catch (Throwable $e) {
    // O detalhe técnico vai para o log do servidor, nunca para quem chamou a API.
    error_log('[atacado] ' . $e::class . ': ' . $e->getMessage());
    Http::responder(500, ['erro' => ['codigo' => 'erro_interno', 'mensagem' => 'Erro interno. Tente de novo em instantes.', 'detalhes' => []]]);
}
