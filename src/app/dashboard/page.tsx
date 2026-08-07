import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from './actions';

const SESSION_COOKIE = 'thorpdv_test_session';

const modules = [
  ['Vendas hoje', 'R$ 0,00'],
  ['Pedidos', '0'],
  ['Produtos', '0'],
  ['Estoque crítico', '0'],
];

const navigation = [
  ['Dashboard', '/dashboard'],
  ['Vendas', '/dashboard'],
  ['Produtos', '/dashboard'],
  ['Estoque', '/dashboard'],
  ['Clientes', '/dashboard'],
  ['Fornecedores', '/dashboard'],
  ['Financeiro', '/dashboard'],
  ['Fiscal', '/dashboard'],
  ['Configurações', '/dashboard'],
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayIdentity = user?.email ?? 'Acesso de teste';

  if (!user) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) redirect('/login');

    const { data, error } = await supabase.rpc('temp_session_status', { p_token: token });
    const status = data as { ok?: boolean; must_change_password?: boolean } | null;

    if (error || !status?.ok) redirect('/login');
    if (status.must_change_password) redirect('/change-password');

    displayIdentity = 'Acesso temporário de testes';
  }

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">THOR<span>PDV</span></div>
        <nav className="nav">
          {navigation.map(([label, href], index) => (
            <Link className={index === 0 ? 'active' : undefined} href={href} key={label}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="content">
        <div className="topbar">
          <div>
            <div className="muted">ThorPDV V1</div>
            <h1>Painel administrativo</h1>
            <p className="muted">Conectado como {displayIdentity}</p>
          </div>
          <form action={logout}>
            <button className="button secondary">Sair</button>
          </form>
        </div>

        <div className="grid">
          {modules.map(([label, value]) => (
            <article className="card metric" key={label}>
              <span className="muted">{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>

        <section className="card" style={{ marginTop: 24 }}>
          <h2>Fundação V1</h2>
          <p className="muted">
            Autenticação, multiempresa, filiais, cadastros, estoque, vendas, pagamentos e documentos fiscais
            estão sendo estruturados nesta primeira etapa.
          </p>
        </section>
      </section>
    </main>
  );
}
