<?php
declare(strict_types=1);

/**
 * Conexão PDO. SQLite por padrão; MySQL/MariaDB com ATACADO_DB=mysql.
 * Prepares reais (sem emulação): o valor nunca é colado no texto do SQL.
 */
final class Banco
{
    public readonly PDO $pdo;
    public readonly string $motor;

    public function __construct()
    {
        $this->motor = getenv('ATACADO_DB') === 'mysql' ? 'mysql' : 'sqlite';
        $opcoes = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if ($this->motor === 'mysql') {
            $host = getenv('ATACADO_MYSQL_HOST') ?: '127.0.0.1';
            $porta = getenv('ATACADO_MYSQL_PORT') ?: '3306';
            $nome = getenv('ATACADO_MYSQL_DB') ?: 'atacado_digital';
            $dsn = "mysql:host={$host};port={$porta};dbname={$nome};charset=utf8mb4";
            $this->pdo = new PDO($dsn, getenv('ATACADO_MYSQL_USER') ?: 'atacado', getenv('ATACADO_MYSQL_PASS') ?: '', $opcoes);
            $this->pdo->exec("SET time_zone = '+00:00'");
        } else {
            $this->pdo = new PDO('sqlite:' . self::caminhoSqlite(), null, null, $opcoes);
            $this->pdo->exec('PRAGMA foreign_keys = ON');
            $this->pdo->exec('PRAGMA busy_timeout = 8000');
            $this->pdo->exec('PRAGMA journal_mode = WAL');
        }
    }

    public static function dirDados(): string
    {
        return getenv('ATACADO_DATA_DIR') ?: dirname(__DIR__) . '/data';
    }

    public static function caminhoSqlite(): string
    {
        return self::dirDados() . '/atacado.sqlite';
    }

    public function linhas(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    public function linha(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $r = $st->fetch();
        $st->closeCursor();
        return $r === false ? null : $r;
    }

    public function executar(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    /**
     * Tudo dentro de $fn é gravado junto ou nada é gravado.
     * No SQLite abre com BEGIN IMMEDIATE para reservar a escrita logo no início
     * e evitar erro de banco ocupado no meio de um pedido concorrente.
     */
    public function transacao(callable $fn): mixed
    {
        if ($this->motor === 'sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
        } else {
            $this->pdo->beginTransaction();
        }
        try {
            $r = $fn();
            $this->pdo->exec('COMMIT');
            return $r;
        } catch (Throwable $e) {
            $this->pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    /** Separa um arquivo .sql em comandos, respeitando textos e comentários. */
    public static function dividirScript(string $sql): array
    {
        $comandos = [];
        $atual = '';
        $n = strlen($sql);
        for ($i = 0; $i < $n; $i++) {
            $c = $sql[$i];
            $d = $sql[$i + 1] ?? '';
            if ($c === '-' && $d === '-') {
                $fim = strpos($sql, "\n", $i);
                $i = $fim === false ? $n : $fim;
                $atual .= "\n";
            } elseif ($c === '/' && $d === '*') {
                $fim = strpos($sql, '*/', $i);
                $fim = $fim === false ? $n : $fim + 1;
                $atual .= substr($sql, $i, $fim - $i + 1);
                $i = $fim;
            } elseif ($c === "'") {
                $fim = $i + 1;
                while ($fim < $n) {
                    if ($sql[$fim] === "'") {
                        if (($sql[$fim + 1] ?? '') === "'") {
                            $fim += 2;
                            continue;
                        }
                        break;
                    }
                    $fim++;
                }
                $atual .= substr($sql, $i, $fim - $i + 1);
                $i = $fim;
            } elseif ($c === ';') {
                if (trim($atual) !== '') {
                    $comandos[] = trim($atual);
                }
                $atual = '';
            } else {
                $atual .= $c;
            }
        }
        if (trim($atual) !== '') {
            $comandos[] = trim($atual);
        }
        return $comandos;
    }

    public function rodarArquivo(string $caminho): void
    {
        foreach (self::dividirScript((string) file_get_contents($caminho)) as $comando) {
            $this->pdo->exec($comando);
        }
    }

    public function instalado(): bool
    {
        try {
            return $this->linha("SELECT valor FROM configuracoes WHERE chave = 'versao_dados'") !== null;
        } catch (PDOException) {
            return false;
        }
    }
}
