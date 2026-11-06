<?php
declare(strict_types=1);

/** Login com password_hash, sessão em cookie protegido e token contra CSRF. */
final class Autenticacao
{
    private const MAX_FALHAS = 5;
    private const JANELA_SEGUNDOS = 900;
    // Hash de um texto aleatório descartado. Não dá acesso a nada; só iguala o tempo de resposta.
    private const HASH_FALSO = '$2y$10$VZacRzm1Q6HV7WhNuYP.w.mEDfhb4PK9PGvyVilOwg38LJX9Jpbka';

    public function __construct(private Banco $banco)
    {
    }

    /** Só abre sessão para quem já tem cookie ou está fazendo login: visitante anônimo não gera arquivo. */
    public static function iniciarSessao(bool $abrirNova): void
    {
        if (!$abrirNova && !isset($_COOKIE['atacado_sessao'])) {
            return;
        }
        $dir = Banco::dirDados() . '/sessoes';
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
        session_save_path($dir);
        session_name('atacado_sessao');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => ($_SERVER['HTTPS'] ?? '') === 'on',
        ]);
        ini_set('session.use_strict_mode', '1');
        session_start();
    }

    public function entrar(array $dados): array
    {
        $email = is_string($dados['email'] ?? null) ? mb_strtolower(trim($dados['email'])) : '';
        $senha = is_string($dados['senha'] ?? null) ? $dados['senha'] : '';
        if ($email === '' || $senha === '' || strlen($senha) > 200) {
            throw new ErroApi(422, 'dados_invalidos', 'Informe e-mail e senha.');
        }

        $chave = hash('sha256', $email . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
        $limite = gmdate('Y-m-d H:i:s', time() - self::JANELA_SEGUNDOS);
        $falhas = (int) $this->banco->linha(
            'SELECT COUNT(*) AS n FROM tentativas_login WHERE chave = ? AND criado_em > ?',
            [$chave, $limite]
        )['n'];
        if ($falhas >= self::MAX_FALHAS) {
            throw new ErroApi(429, 'muitas_tentativas', 'Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.');
        }

        $usuario = $this->banco->linha(
            'SELECT id, nome, email, senha_hash, papel, cliente_id FROM usuarios WHERE email = ? AND ativo = 1',
            [$email]
        );
        // Sem usuário, verifica mesmo assim um hash qualquer: o tempo de resposta não revela se o e-mail existe.
        $hash = $usuario['senha_hash'] ?? self::HASH_FALSO;
        $correta = password_verify($senha, $hash);
        if (!$usuario || !$correta) {
            $this->banco->executar(
                'INSERT INTO tentativas_login (chave, criado_em) VALUES (?, ?)',
                [$chave, gmdate('Y-m-d H:i:s')]
            );
            throw new ErroApi(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.');
        }

        $this->banco->executar('DELETE FROM tentativas_login WHERE chave = ?', [$chave]);
        if (password_needs_rehash($usuario['senha_hash'], PASSWORD_DEFAULT)) {
            $this->banco->executar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [password_hash($senha, PASSWORD_DEFAULT), $usuario['id']]);
        }
        $this->banco->executar('UPDATE usuarios SET ultimo_login = ? WHERE id = ?', [gmdate('Y-m-d H:i:s'), $usuario['id']]);

        session_regenerate_id(true);
        $_SESSION['usuario_id'] = (int) $usuario['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return $this->publico($usuario);
    }

    public function sair(): void
    {
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    }

    public function atual(): ?array
    {
        $id = $_SESSION['usuario_id'] ?? null;
        if (!is_int($id)) {
            return null;
        }
        return $this->banco->linha(
            'SELECT id, nome, email, papel, cliente_id FROM usuarios WHERE id = ? AND ativo = 1',
            [$id]
        );
    }

    public function exigirLogin(): array
    {
        $u = $this->atual();
        if (!$u) {
            throw new ErroApi(401, 'nao_autenticado', 'Faça login para continuar.');
        }
        return $u;
    }

    public function exigirGestor(): array
    {
        $u = $this->exigirLogin();
        if ($u['papel'] !== 'gestor') {
            throw new ErroApi(403, 'sem_permissao', 'Só o gestor pode acessar este recurso.');
        }
        return $u;
    }

    public function exigirCsrf(): void
    {
        $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($_SESSION['csrf'] ?? null) || !hash_equals($_SESSION['csrf'], $enviado)) {
            throw new ErroApi(403, 'csrf_invalido', 'Token de segurança ausente ou incorreto.');
        }
    }

    public function publico(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'nome' => $u['nome'],
            'email' => $u['email'],
            'papel' => $u['papel'],
            'cliente_id' => $u['cliente_id'] === null ? null : (int) $u['cliente_id'],
            'csrf' => $_SESSION['csrf'] ?? null,
        ];
    }
}
