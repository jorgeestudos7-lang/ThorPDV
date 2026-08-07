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
          O e-mail de teste já está definido. Digite manualmente a senha temporária de 8 dígitos; o navegador não usará senha salva.
        </p>

        {params.error ? <p className="error">{params.error}</p> : null}
        {params.message ? <p className="muted">{params.message}</p> : null}

        <form className="form" autoComplete="off">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={TEST_EMAIL}
              readOnly
              autoComplete="off"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha temporária</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
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
