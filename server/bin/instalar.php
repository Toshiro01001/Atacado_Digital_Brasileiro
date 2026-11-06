<?php
declare(strict_types=1);

// Cria o banco com os mesmos scripts da pasta sql/ e os usuários de demonstração.
// Senhas: vêm de ATACADO_SENHA_GESTOR e ATACADO_SENHA_COMPRADOR, ou são sorteadas e mostradas uma única vez.
// Uso: php server/bin/instalar.php [--recriar]

if (PHP_SAPI !== 'cli') {
    exit("Rode pela linha de comando.\n");
}
require __DIR__ . '/../src/Banco.php';

$recriar = in_array('--recriar', $argv, true);
if (!is_dir(Banco::dirDados())) {
    mkdir(Banco::dirDados(), 0700, true);
}
if ($recriar && getenv('ATACADO_DB') !== 'mysql') {
    foreach (['', '-wal', '-shm'] as $sufixo) {
        @unlink(Banco::caminhoSqlite() . $sufixo);
    }
}
$banco = new Banco();
if ($recriar && $banco->motor === 'mysql') {
    $banco->pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($banco->linhas('SELECT table_name AS nome, table_type AS tipo FROM information_schema.tables WHERE table_schema = DATABASE()') as $t) {
        $tipo = $t['tipo'] === 'VIEW' ? 'VIEW' : 'TABLE';
        $banco->pdo->exec("DROP {$tipo} IF EXISTS `{$t['nome']}`");
    }
    $banco->pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}
if ($banco->instalado()) {
    fwrite(STDERR, "O banco já está instalado. Use --recriar para apagar e começar de novo.\n");
    exit(1);
}

$pasta = dirname(__DIR__, 2) . '/sql/';
foreach (['01_esquema.sql', '02_visoes.sql', '03_dados_demo.sql'] as $arquivo) {
    $banco->rodarArquivo($pasta . $arquivo);
}

$usuarios = [
    ['Gestor de demonstração', 'gestor@atacado.exemplo.invalid', 'gestor', null, getenv('ATACADO_SENHA_GESTOR')],
    ['Comprador fictício do Mercadinho', 'compras@mercadinho.exemplo.invalid', 'comprador', 1, getenv('ATACADO_SENHA_COMPRADOR')],
    ['Comprador fictício da Padaria', 'compras@padaria.exemplo.invalid', 'comprador', 2, getenv('ATACADO_SENHA_COMPRADOR')],
];
echo "Banco instalado ({$banco->motor}). Usuários de demonstração:\n";
foreach ($usuarios as [$nome, $email, $papel, $cliente, $senha]) {
    $mostrar = false;
    if (!is_string($senha) || $senha === '') {
        $senha = bin2hex(random_bytes(9));
        $mostrar = true;
    }
    $banco->executar(
        'INSERT INTO usuarios (nome, email, senha_hash, papel, cliente_id) VALUES (?, ?, ?, ?, ?)',
        [$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $papel, $cliente]
    );
    echo "  {$papel}: {$email}" . ($mostrar ? "  senha: {$senha}" : '  senha: a informada no ambiente') . "\n";
}
