import Link from 'next/link';
import { changePassword } from './actions';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <Link href="/" className="brand">THOR<span>PDV</span></Link>
        <h1>Defina sua nova senha</h1>
        <p className="muted">Por segurança, troque a senha temporária antes de acessar o dashboard.</p>

        {params.error ? <p className="error">{params.error}</p> : null}

        <form className="form">
          <div className="field">
            <label htmlFor="newPassword">Nova senha</label>
            <input id="newPassword" name="newPassword" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirmar nova senha</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <button className="button" formAction={changePassword}>Salvar e entrar</button>
        </form>
      </section>
    </main>
  );
}
