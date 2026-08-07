import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="shell">
      <header className="header">
        <div className="brand">THOR<span>PDV</span></div>
        <Link className="button secondary" href={user ? '/dashboard' : '/login'}>
          {user ? 'Abrir painel' : 'Entrar'}
        </Link>
      </header>

      <section className="hero">
        <div className="muted">ERP + PDV + Fiscal + Estoque + Financeiro</div>
        <h1>Gestão forte para vender sem parar.</h1>
        <p>
          O ThorPDV nasce como uma plataforma SaaS para o varejo brasileiro, preparada para
          múltiplas empresas, filiais, usuários, estoque, vendas e emissão fiscal.
        </p>
        <div>
          <Link className="button" href={user ? '/dashboard' : '/login'}>
            Começar agora
          </Link>
        </div>
      </section>
    </main>
  );
}
