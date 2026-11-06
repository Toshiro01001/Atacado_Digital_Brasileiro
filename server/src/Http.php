<?php
declare(strict_types=1);

/** Entrada e saída HTTP em JSON. */
final class Http
{
    public static function responder(int $status, array $corpo): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: no-store');
        echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** Lê o corpo JSON. Exigir o Content-Type também barra formulários enviados de outro site. */
    public static function corpoJson(): array
    {
        $tipo = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
        if (!str_starts_with($tipo, 'application/json')) {
            throw new ErroApi(415, 'tipo_invalido', 'Envie o corpo em JSON, com Content-Type application/json.');
        }
        $bruto = file_get_contents('php://input', false, null, 0, 1048576);
        $dados = json_decode((string) $bruto, true);
        if (!is_array($dados)) {
            throw new ErroApi(400, 'json_invalido', 'O corpo da requisição não é um JSON válido.');
        }
        return $dados;
    }

    public static function inteiroPositivo(mixed $valor): ?int
    {
        if (is_int($valor) && $valor > 0) {
            return $valor;
        }
        return null;
    }
}
