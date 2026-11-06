<?php
declare(strict_types=1);

/** Erro de regra de negócio ou de acesso: vira resposta JSON com o status indicado. */
final class ErroApi extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $codigo,
        string $mensagem,
        public readonly array $detalhes = []
    ) {
        parent::__construct($mensagem);
    }
}
