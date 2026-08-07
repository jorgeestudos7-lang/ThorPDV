import { notFound } from 'next/navigation';
import { AdvancedShell } from '../../[...slug]/advanced-shell';
import { ReportWorkspace } from '../../[...slug]/report-workspace';
import { erpReportV2 } from '../../[...slug]/report-actions';
import { erpLoad } from '../../[...slug]/actions';
import '../../[...slug]/module.css';
import '../../[...slug]/report-v2.css';

const reports: Record<string,{type:string;title:string;subtitle:string}> = {
  'fechamento-caixa':{type:'cash_closures',title:'Relatório de Fechamento de Caixa',subtitle:'Resumo por sessão, operador, PDV, vendas, movimentações e diferença de caixa.'},
  'fechamento-caixa-detalhado':{type:'cash_closures_detailed',title:'Relatório Detalhado de Fechamento de Caixa',subtitle:'Conferência das formas de pagamento, suprimentos, sangrias, devoluções e valores contados.'},
  'estoque':{type:'stock_movements',title:'Relatório de Estoque',subtitle:'Histórico de entradas, saídas, vendas, perdas, ajustes e transferências.'},
  'posicao-estoque':{type:'stock_position',title:'Posição de Estoque',subtitle:'Saldo físico, reservado, disponível, mínimo e valorização atual por filial.'},
  'inventario':{type:'inventory',title:'Relatório de Inventário',subtitle:'Esperado, contado e diferenças registradas nos inventários.'},
  'ranking-produtos':{type:'product_ranking',title:'Ranking de Produtos Mais Vendidos',subtitle:'Ranking por quantidade, vendas e faturamento no período.'},
  'produtos-forma-pagamento':{type:'product_payment',title:'Produtos × Forma de Pagamento',subtitle:'Distribuição do faturamento dos produtos entre dinheiro, PIX, cartões e outras formas.'},
  'vendedores':{type:'sellers',title:'Relatório de Vendedores',subtitle:'Desempenho por operador: vendas, itens, faturamento, descontos e ticket médio.'},
  'formas-pagamento':{type:'payment_methods',title:'Relatório de Formas de Pagamento',subtitle:'Transações e valores por dinheiro, PIX, débito, crédito, voucher e demais formas.'},
  'fluxo-caixa':{type:'cash_flow',title:'Demonstrativo de Fluxo de Caixa',subtitle:'Entradas, saídas, realizado, previsto e saldo diário.'},
  'contas-receber':{type:'receivables',title:'Relatório de Contas a Receber',subtitle:'Títulos, clientes, vencimentos, baixas e saldos em aberto.'},
  'contas-pagar':{type:'payables',title:'Relatório de Contas a Pagar',subtitle:'Títulos, fornecedores, vencimentos, pagamentos e saldos em aberto.'},
  'balanco-patrimonial':{type:'balance_sheet',title:'Balanço Patrimonial Gerencial',subtitle:'Visão operacional de caixa, bancos, recebíveis, estoques, obrigações e saldo patrimonial.'},
  'vendas-cfop':{type:'sales_cfop',title:'Relatório de Vendas por CFOP',subtitle:'Quantidade, vendas e faturamento agrupados pelo CFOP efetivamente usado na operação.'},
  'produtos-tributacao':{type:'products_taxation',title:'Relatório de Produtos por Tributação',subtitle:'NCM, CEST, CFOP, origem e enquadramentos tributários cadastrados nos produtos.'},
  // Compatibilidade com URLs antigas
  'vendas':{type:'product_ranking',title:'Relatório de Vendas por Produto',subtitle:'Produtos vendidos, quantidade e faturamento no período.'},
  'financeiro':{type:'cash_flow',title:'Relatório Financeiro / Fluxo de Caixa',subtitle:'Entradas, saídas e saldos financeiros por período.'},
  'listagens':{type:'products_taxation',title:'Listagem de Produtos',subtitle:'Produtos e principais dados fiscais cadastrados.'},
};

export default async function ReportPage({ params }: { params: Promise<{report:string}> }) {
  const { report } = await params;
  const meta=reports[report];
  if(!meta) notFound();
  const [branches,initial]=await Promise.all([erpLoad('branches'),erpReportV2(meta.type)]);
  return <AdvancedShell title={meta.title} subtitle={meta.subtitle} activePath={`/dashboard/relatorios/${report}`}>
    <ReportWorkspace report={meta.type} branches={branches.data} initial={initial}/>
  </AdvancedShell>;
}
