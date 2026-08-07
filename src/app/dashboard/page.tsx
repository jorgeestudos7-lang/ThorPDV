import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from './actions';

const modules = [
  ['Vendas hoje', 'R$ 0,00'],
  ['Pedidos', '0'],
  ['Produtos', '0'],
  ['Estoque crítico', '0'],
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">THOR<span>PDV</span></div>
        <nav className="nav">
          <a className="active" href="/dashboard">Dashboard</a>
          <a href="#">Vendas</a>
          <a href="#">Produtos</a>
          <a href="#">Estoque</a>
          <a href="#">Clientes</a>
          <a href="#">Fornecedores</a>
          <a href="#">Financeiro</a>
          <a href="#">Fiscal</a>
          <a href="#">Configurações</a>
        </nav>
      </aside>

      <section className="content">
        <div className="topbar">
          <div>
            <div className="muted">ThorPDV V1</div>
            <h1>Painel administrativo</h1>
            <p className="muted">Conectado como {user.email}</p>
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
