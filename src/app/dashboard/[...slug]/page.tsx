import './module.css';
import './advanced.css';
import './price-table.css';
import './sale.css';
import './promotion.css';
import './organization.css';
import './fiscal.css';
import { ModuleClient } from './module-client';
import { AdvancedShell } from './advanced-shell';
import { CashClient, InventoryClient, ReportsClient, StockTransferClient } from './advanced-clients';
import { PriceTableWorkspace } from './price-table-workspace';
import { PromotionWorkspace } from './promotion-workspace';
import { SaleWorkspace } from './sale-workspace';
import { StockWorkspace } from './stock-workspace';
import { OrganizationWorkspace } from './organization-workspace';
import { FiscalWorkspace } from './fiscal-workspace';
import { erpFiscalSettingsGet, erpLoad } from './actions';

const resourceBySlug: Record<string, string> = {
  'clientes': 'customers', 'clientes/novo': 'customers', 'fornecedores': 'suppliers',
  'perfis-pdv': 'profiles_pdv', 'usuarios-pdv': 'users_pdv', 'perfis-adm': 'profiles_adm', 'usuarios-adm': 'users_adm',
  'produtos': 'products', 'produtos/novo': 'products', 'grupos': 'groups', 'classes': 'classes', 'modificadores': 'modifiers',
  'tabelas-precos': 'price_tables', 'tabelas-precos/copiar': 'price_tables', 'tabelas-precos/ajustes': 'price_adjustments', 'promocoes': 'promotions',
  'estoque': 'stock', 'estoque/nova': 'stock', 'estoque/inventario': 'inventory_counts', 'estoque/ajustes': 'stock', 'estoque/transferencias': 'stock',
  'financeiro/receber': 'finance', 'financeiro/receber/novo': 'finance', 'financeiro/pagar': 'finance', 'financeiro/pagar/novo': 'finance',
  'financeiro/fluxo-caixa': 'report_finance', 'financeiro/conciliacao': 'finance',
  'administrativo/empresas': 'companies', 'administrativo/pdvs': 'pos_registers', 'fiscal': 'fiscal_documents', 'fiscal/nfe':'fiscal_documents', 'fiscal/nfce':'fiscal_documents', 'integracoes': 'integrations', 'configuracoes': 'companies',
  'relatorios/financeiro': 'report_finance', 'relatorios/vendas': 'report_sales', 'relatorios/estoque': 'report_stock', 'relatorios/listagens': 'products',
  'atendimento': 'tickets', 'atendimento/mensagens': 'tickets', 'atendimento/sla': 'tickets',
  'vendas/nova': 'sales', 'pdv/caixa': 'pos_registers', 'ajuda': 'companies',
};

export default async function ModulePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolved = await params;
  const slug = resolved.slug.join('/');
  const resource = resourceBySlug[slug] ?? 'products';
  const initial = await erpLoad(resource);
  const [products, customers, groups, classes, branches, profilesPdv, profilesAdm, priceTables, suppliers] = await Promise.all([
    erpLoad('products'), erpLoad('customers'), erpLoad('groups'), erpLoad('classes'), erpLoad('branches'),
    erpLoad('profiles_pdv'), erpLoad('profiles_adm'), erpLoad('price_tables'), erpLoad('suppliers'),
  ]);

  if (slug === 'vendas/nova') return <AdvancedShell title="Nova Venda PDV" subtitle="Preço resolvido no servidor, baixa de estoque, pagamento, caixa e financeiro em uma única operação." activePath="/dashboard"><SaleWorkspace customers={customers.data} priceTables={priceTables.data}/></AdvancedShell>;
  if (slug === 'promocoes') return <AdvancedShell title="Promoções" subtitle="Regras comerciais aplicadas automaticamente pelo motor de preço da venda." activePath="/dashboard/promocoes"><PromotionWorkspace initial={initial.data} products={products.data} groups={groups.data}/></AdvancedShell>;
  if (slug === 'estoque' || slug === 'estoque/nova') return <AdvancedShell title="Gestão de Estoque" subtitle="Entradas, saídas, perdas e ajustes com validação de saldo." activePath="/dashboard/estoque"><StockWorkspace products={products.data} history={initial.data}/></AdvancedShell>;
  if (slug === 'estoque/ajustes') return <AdvancedShell title="Ajustes de Estoque" subtitle="Correções de saldo com histórico e rastreabilidade." activePath="/dashboard/estoque/ajustes"><StockWorkspace products={products.data} history={initial.data} mode="adjustment"/></AdvancedShell>;
  if (slug === 'estoque/transferencias') return <AdvancedShell title="Transferências de Estoque" subtitle="Movimente produtos entre filiais com dupla escrituração de estoque." activePath="/dashboard/estoque/transferencias"><StockTransferClient products={products.data} branches={branches.data} history={initial.data}/></AdvancedShell>;
  if (slug === 'estoque/inventario') return <AdvancedShell title="Inventários" subtitle="Contagem física, diferenças e ajuste automático de estoque." activePath="/dashboard/estoque/inventario"><InventoryClient inventories={initial.data}/></AdvancedShell>;
  if (slug === 'tabelas-precos' || slug === 'tabelas-precos/copiar') return <AdvancedShell title={slug.endsWith('copiar')?'Copiar Tabela de Preços':'Gestão de Tabelas de Preços'} subtitle="Preços específicos por produto, vigência, edição e cópia integral de tabelas." activePath={`/dashboard/${slug}`}><PriceTableWorkspace initialTables={priceTables.data} products={products.data} copyMode={slug.endsWith('copiar')}/></AdvancedShell>;
  if (slug === 'administrativo/empresas') return <AdvancedShell title="Empresas e Filiais" subtitle="Estrutura empresarial compartilhada por estoque, vendas, caixa, fiscal e relatórios." activePath="/dashboard/administrativo/empresas"><OrganizationWorkspace initialCompanies={initial.data} initialBranches={branches.data}/></AdvancedShell>;
  if (slug === 'pdv/caixa') return <AdvancedShell title="Caixa / PDV" subtitle="Abertura, vendas vinculadas e fechamento com valor esperado por terminal." activePath="/dashboard/administrativo/pdvs"><CashClient posRegisters={initial.data}/></AdvancedShell>;
  if (slug === 'fiscal' || slug === 'fiscal/nfe' || slug === 'fiscal/nfce') {
    const [settings, sales] = await Promise.all([erpFiscalSettingsGet(), erpLoad('sales')]);
    return <AdvancedShell title="Fiscal" subtitle="Validação e preparação de NF-e/NFC-e com transmissão bloqueada até configurar credenciais reais." activePath="/dashboard/fiscal"><FiscalWorkspace initialDocs={initial.data} sales={sales.data} settings={(settings.settings ?? {}) as Record<string, unknown>} preselect={slug.endsWith('nfce')?'nfce':'nfe'}/></AdvancedShell>;
  }
  if (slug === 'relatorios/vendas') return <AdvancedShell title="Relatório de Vendas PDV" subtitle="Faturamento e quantidade por produto, período e filial." activePath="/dashboard/relatorios/vendas"><ReportsClient type="sales" branches={branches.data} initial={initial.data}/></AdvancedShell>;
  if (slug === 'relatorios/financeiro' || slug === 'financeiro/fluxo-caixa') return <AdvancedShell title={slug.startsWith('relatorios')?'Relatório Financeiro':'Fluxo de Caixa'} subtitle="Entradas, saídas, realizado e previsto por período e filial." activePath={slug.startsWith('relatorios')?'/dashboard/relatorios/financeiro':'/dashboard/financeiro/fluxo-caixa'}><ReportsClient type="finance" branches={branches.data} initial={initial.data}/></AdvancedShell>;
  if (slug === 'relatorios/estoque') return <AdvancedShell title="Relatório de Estoque" subtitle="Saldo, estoque mínimo, custo e valor por filial." activePath="/dashboard/relatorios/estoque"><ReportsClient type="stock" branches={branches.data} initial={initial.data}/></AdvancedShell>;

  return <ModuleClient slug={slug} resource={resource} initialData={initial.data} lookups={{
    products: products.data, customers: customers.data, groups: groups.data, classes: classes.data, branches: branches.data,
    profiles_pdv: profilesPdv.data, profiles_adm: profilesAdm.data, price_tables: priceTables.data, suppliers: suppliers.data,
  }} />;
}
