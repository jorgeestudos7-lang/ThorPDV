import Link from 'next/link';
import { login } from './actions';

const TEST_EMAIL = 'silvas3cardos0@gmail.com';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <Link href="/" className="brand">THOR<span>PDV</span></Link>
        <h1>Acesso de testes</h1>
        <p className="muted">
          O e-mail de teste já está definido. Use a senha atual da conta. A senha temporária de 8 dígitos é usada somente no primeiro acesso ou após um reset.
        </p>

        {params.error ? <p className="error">{params.error}</p> : null}
        {params.message ? <p className="muted">{params.message}</p> : null}

        <form className="form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={TEST_EMAIL}
              readOnly
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              autoFocus
            />
          </div>
          <button className="button" formAction={login}>Entrar</button>
        </form>
      </section>
    </main>
  );
}
