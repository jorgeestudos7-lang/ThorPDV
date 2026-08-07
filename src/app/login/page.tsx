import Link from 'next/link';
import { login, signup } from './actions';

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
        <h1>Acesse sua operação</h1>
        <p className="muted">Entre com sua conta ou crie o primeiro usuário do ambiente.</p>

        {params.error ? <p className="error">{params.error}</p> : null}
        {params.message ? <p className="muted">{params.message}</p> : null}

        <form className="form">
          <div className="field">
            <label htmlFor="fullName">Nome (para cadastro)</label>
            <input id="fullName" name="fullName" type="text" placeholder="Seu nome" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
          </div>
          <button className="button" formAction={login}>Entrar</button>
          <button className="button secondary" formAction={signup}>Criar conta</button>
        </form>
      </section>
    </main>
  );
}
