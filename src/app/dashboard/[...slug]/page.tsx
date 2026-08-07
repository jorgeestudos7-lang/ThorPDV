import { ModuleClient } from './module-client';
import { erpLoad } from './actions';

const resourceBySlug: Record<string, string> = {
  'clientes': 'customers',
  'clientes/novo': 'customers',
  'fornecedores': 'suppliers',
  'perfis-pdv': 'profiles_pdv',
  'usuarios-pdv': 'users_pdv',
  'perfis-adm': 'profiles_adm',
  'usuarios-adm': 'users_adm',
  'produtos': 'products',
  'produtos/novo': 'products',
  'grupos': 'groups',
  'classes': 'classes',
  'modificadores': 'modifiers',
  'tabelas-precos': 'price_tables',
  'tabelas-precos/copiar': 'price_tables',
  'tabelas-precos/ajustes': 'price_adjustments',
  'promocoes': 'promotions',
  'estoque': 'stock',
  'estoque/nova': 'stock',
  'estoque/inventario': 'inventory_counts',
  'estoque/ajustes': 'stock',
  'estoque/transferencias': 'stock',
  'financeiro/receber': 'finance',
  'financeiro/receber/novo': 'finance',
  'financeiro/pagar': 'finance',
  'financeiro/pagar/novo': 'finance',
  'financeiro/fluxo-caixa': 'report_finance',
  'financeiro/conciliacao': 'finance',
  'administrativo/empresas': 'companies',
  'administrativo/pdvs': 'pos_registers',
  'fiscal': 'fiscal_documents',
  'integracoes': 'integrations',
  'configuracoes': 'companies',
  'relatorios/financeiro': 'report_finance',
  'relatorios/vendas': 'report_sales',
  'relatorios/estoque': 'report_stock',
  'relatorios/listagens': 'products',
  'atendimento': 'tickets',
  'atendimento/mensagens': 'tickets',
  'atendimento/sla': 'tickets',
  'vendas/nova': 'sales',
  'pdv/caixa': 'pos_registers',
  'ajuda': 'companies',
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

  return <ModuleClient slug={slug} resource={resource} initialData={initial.data} lookups={{
    products: products.data, customers: customers.data, groups: groups.data, classes: classes.data, branches: branches.data,
    profiles_pdv: profilesPdv.data, profiles_adm: profilesAdm.data, price_tables: priceTables.data, suppliers: suppliers.data,
  }} />;
}
