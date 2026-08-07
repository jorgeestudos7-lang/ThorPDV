import Link from 'next/link';

export default function Home() {
  return (
    <main className="shell">
      <header className="header">
        <div className="brand">THOR<span>PDV</span></div>
        <Link className="button secondary" href="/login">Entrar</Link>
      </header>

      <section className="hero">
        <div className="muted">ERP + PDV + Fiscal + Estoque + Financeiro</div>
        <h1>Gestão forte para vender sem parar.</h1>
        <p>
          O ThorPDV nasce como uma plataforma SaaS para o varejo brasileiro, preparada para
          múltiplas empresas, filiais, usuários, estoque, vendas e emissão fiscal.
        </p>
        <div>
          <Link className="button" href="/login">Começar agora</Link>
        </div>
      </section>
    </main>
  );
}
