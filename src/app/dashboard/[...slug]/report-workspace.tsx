'use client';

import { useMemo, useState } from 'react';
import { erpReportV2 } from './report-actions';

type Row = Record<string, unknown>;
type Format = 'money'|'date'|'datetime'|'number'|'status'|'payment'|'boolean'|'json';
type Column = { key:string; label:string; format?:Format };
type Metric = { label:string; key?:string; count?:boolean; format?:Format };
type Definition = { title:string; note?:string; period?:boolean; branch?:boolean; columns:Column[]; metrics:Metric[] };

const paymentLabels: Record<string,string> = {
  cash:'Dinheiro', pix:'PIX', debit_card:'Débito', credit_card:'Crédito', voucher:'Voucher',
  store_credit:'Crédito em loja', other:'Outros',
};

export const reportDefinitions: Record<string,Definition> = {
  cash_closures:{title:'Relatório de Fechamento de Caixa',columns:[
    {key:'opened_at',label:'Abertura',format:'datetime'},{key:'closed_at',label:'Fechamento',format:'datetime'},{key:'pos',label:'PDV'},{key:'branch',label:'Filial'},{key:'operator',label:'Operador'},
    {key:'sales_count',label:'Vendas',format:'number'},{key:'sales_total',label:'Vendas R$',format:'money'},{key:'opening_amount',label:'Fundo',format:'money'},{key:'cash_payments',label:'Dinheiro',format:'money'},
    {key:'supply',label:'Suprimento',format:'money'},{key:'withdrawal',label:'Sangria',format:'money'},{key:'expected_cash',label:'Esperado',format:'money'},{key:'closing_amount',label:'Contado',format:'money'},{key:'difference',label:'Diferença',format:'money'}],
    metrics:[{label:'Fechamentos',count:true},{label:'Vendas',key:'sales_total',format:'money'},{label:'Diferença acumulada',key:'difference',format:'money'}]},
  cash_closures_detailed:{title:'Relatório Detalhado de Fechamento de Caixa',columns:[
    {key:'opened_at',label:'Abertura',format:'datetime'},{key:'closed_at',label:'Fechamento',format:'datetime'},{key:'pos',label:'PDV'},{key:'branch',label:'Filial'},{key:'operator',label:'Operador'},
    {key:'payment_breakdown',label:'Pagamentos sistema'},{key:'counted_breakdown',label:'Pagamentos conferidos'},{key:'payment_differences',label:'Diferenças por forma'},
    {key:'opening_amount',label:'Fundo',format:'money'},{key:'supply',label:'Suprimento',format:'money'},{key:'withdrawal',label:'Sangria',format:'money'},{key:'refund',label:'Devoluções',format:'money'},
    {key:'expected_cash',label:'Esperado',format:'money'},{key:'closing_amount',label:'Contado',format:'money'},{key:'difference',label:'Diferença',format:'money'},{key:'notes',label:'Observação'}],
    metrics:[{label:'Fechamentos',count:true},{label:'Vendas',key:'sales_total',format:'money'},{label:'Diferença acumulada',key:'difference',format:'money'}]},
  stock_movements:{title:'Relatório de Estoque / Movimentações',columns:[
    {key:'created_at',label:'Data',format:'datetime'},{key:'branch',label:'Filial'},{key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'movement_type',label:'Movimento',format:'status'},
    {key:'quantity',label:'Quantidade',format:'number'},{key:'unit_cost',label:'Custo unit.',format:'money'},{key:'reference_type',label:'Origem'},{key:'notes',label:'Observação'}],
    metrics:[{label:'Movimentações',count:true},{label:'Quantidade líquida',key:'quantity',format:'number'}]},
  stock_position:{title:'Posição de Estoque',period:false,columns:[
    {key:'branch',label:'Filial'},{key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'physical_stock',label:'Físico',format:'number'},
    {key:'reserved_stock',label:'Reservado',format:'number'},{key:'available_stock',label:'Disponível',format:'number'},{key:'minimum_stock',label:'Mínimo',format:'number'},
    {key:'cost_price',label:'Custo',format:'money'},{key:'stock_value',label:'Valor estoque',format:'money'},{key:'stock_status',label:'Situação',format:'status'}],
    metrics:[{label:'Produtos/filiais',count:true},{label:'Disponível',key:'available_stock',format:'number'},{label:'Valor em estoque',key:'stock_value',format:'money'}]},
  inventory:{title:'Relatório de Inventário',columns:[
    {key:'code',label:'Inventário'},{key:'branch',label:'Filial'},{key:'status',label:'Status',format:'status'},{key:'opened_at',label:'Abertura',format:'datetime'},{key:'closed_at',label:'Fechamento',format:'datetime'},
    {key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'expected_quantity',label:'Esperado',format:'number'},{key:'counted_quantity',label:'Contado',format:'number'},{key:'difference',label:'Diferença',format:'number'}],
    metrics:[{label:'Linhas inventariadas',count:true},{label:'Diferença líquida',key:'difference',format:'number'}]},
  product_ranking:{title:'Ranking de Produtos Mais Vendidos',note:'Por padrão abre o mês atual.',columns:[
    {key:'ranking',label:'#',format:'number'},{key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'quantity',label:'Quantidade',format:'number'},
    {key:'sales_count',label:'Vendas',format:'number'},{key:'avg_unit_price',label:'Preço médio',format:'money'},{key:'revenue',label:'Faturamento',format:'money'}],
    metrics:[{label:'Produtos',count:true},{label:'Quantidade',key:'quantity',format:'number'},{label:'Faturamento',key:'revenue',format:'money'}]},
  product_payment:{title:'Produtos × Forma de Pagamento',note:'Em vendas com pagamento misto, o valor é rateado proporcionalmente entre as formas.',columns:[
    {key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'payment_method',label:'Pagamento',format:'payment'},{key:'sales_count',label:'Vendas',format:'number'},
    {key:'allocated_quantity',label:'Qtd. rateada',format:'number'},{key:'allocated_amount',label:'Valor rateado',format:'money'}],
    metrics:[{label:'Combinações',count:true},{label:'Valor rateado',key:'allocated_amount',format:'money'}]},
  sellers:{title:'Relatório de Vendedores / Operadores',columns:[
    {key:'seller',label:'Vendedor / Operador'},{key:'branch',label:'Filial'},{key:'sales_count',label:'Vendas',format:'number'},{key:'item_quantity',label:'Itens',format:'number'},
    {key:'revenue',label:'Faturamento',format:'money'},{key:'avg_ticket',label:'Ticket médio',format:'money'},{key:'discounts',label:'Descontos',format:'money'},{key:'surcharges',label:'Acréscimos',format:'money'}],
    metrics:[{label:'Operadores',count:true},{label:'Vendas',key:'sales_count',format:'number'},{label:'Faturamento',key:'revenue',format:'money'}]},
  payment_methods:{title:'Relatório de Formas de Pagamento',columns:[
    {key:'payment_method',label:'Forma',format:'payment'},{key:'status',label:'Status',format:'status'},{key:'transactions',label:'Transações',format:'number'},{key:'sales_count',label:'Vendas',format:'number'},
    {key:'amount',label:'Valor aplicado',format:'money'},{key:'tendered_amount',label:'Valor entregue',format:'money'},{key:'change_amount',label:'Troco',format:'money'}],
    metrics:[{label:'Linhas',count:true},{label:'Transações',key:'transactions',format:'number'},{label:'Valor',key:'amount',format:'money'}]},
  cash_flow:{title:'Demonstrativo de Fluxo de Caixa',columns:[
    {key:'report_day',label:'Data',format:'date'},{key:'inflow_realized',label:'Entradas realizadas',format:'money'},{key:'outflow_realized',label:'Saídas realizadas',format:'money'},{key:'realized_balance',label:'Saldo realizado',format:'money'},
    {key:'inflow_forecast',label:'Entradas previstas',format:'money'},{key:'outflow_forecast',label:'Saídas previstas',format:'money'},{key:'forecast_balance',label:'Saldo previsto',format:'money'}],
    metrics:[{label:'Entradas realizadas',key:'inflow_realized',format:'money'},{label:'Saídas realizadas',key:'outflow_realized',format:'money'},{label:'Saldo realizado',key:'realized_balance',format:'money'}]},
  receivables:{title:'Relatório de Contas a Receber',columns:[
    {key:'due_date',label:'Vencimento',format:'date'},{key:'customer',label:'Cliente'},{key:'sale_number',label:'Venda'},{key:'description',label:'Descrição'},{key:'branch',label:'Filial'},{key:'status',label:'Status',format:'status'},
    {key:'amount',label:'Valor',format:'money'},{key:'paid_amount',label:'Recebido',format:'money'},{key:'open_amount',label:'Em aberto',format:'money'},{key:'paid_at',label:'Baixa',format:'datetime'}],
    metrics:[{label:'Títulos',count:true},{label:'Total',key:'amount',format:'money'},{label:'Em aberto',key:'open_amount',format:'money'}]},
  payables:{title:'Relatório de Contas a Pagar',columns:[
    {key:'due_date',label:'Vencimento',format:'date'},{key:'supplier',label:'Fornecedor'},{key:'description',label:'Descrição'},{key:'branch',label:'Filial'},{key:'status',label:'Status',format:'status'},
    {key:'amount',label:'Valor',format:'money'},{key:'paid_amount',label:'Pago',format:'money'},{key:'open_amount',label:'Em aberto',format:'money'},{key:'paid_at',label:'Baixa',format:'datetime'}],
    metrics:[{label:'Títulos',count:true},{label:'Total',key:'amount',format:'money'},{label:'Em aberto',key:'open_amount',format:'money'}]},
  balance_sheet:{title:'Balanço Patrimonial Gerencial',period:false,note:'Visão operacional. Não substitui balanço contábil oficial por partidas dobradas.',columns:[
    {key:'section',label:'Grupo'},{key:'account',label:'Conta / componente'},{key:'amount',label:'Valor',format:'money'}],metrics:[{label:'Componentes',count:true}]},
  sales_cfop:{title:'Relatório de Vendas por CFOP',columns:[
    {key:'cfop',label:'CFOP'},{key:'sales_count',label:'Vendas',format:'number'},{key:'quantity',label:'Quantidade',format:'number'},{key:'revenue',label:'Faturamento',format:'money'}],
    metrics:[{label:'CFOPs',count:true},{label:'Vendas',key:'sales_count',format:'number'},{label:'Faturamento',key:'revenue',format:'money'}]},
  products_taxation:{title:'Relatório de Produtos por Tributação',period:false,branch:false,columns:[
    {key:'sku',label:'Código'},{key:'product',label:'Produto'},{key:'unit',label:'Un.'},{key:'ncm',label:'NCM'},{key:'cest',label:'CEST'},{key:'cfop',label:'CFOP'},{key:'origin',label:'Origem'},
    {key:'icms',label:'CST/CSOSN ICMS'},{key:'pis',label:'PIS'},{key:'cofins',label:'COFINS'},{key:'ipi',label:'IPI'},{key:'active',label:'Ativo',format:'boolean'}],metrics:[{label:'Produtos',count:true}]},
};

function formatValue(value: unknown, format?:Format) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'money') return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  if (format === 'number') return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(value)||0);
  if (format === 'date') { const d=new Date(`${String(value)}T00:00:00`); return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('pt-BR'); }
  if (format === 'datetime') { const d=new Date(String(value)); return Number.isNaN(d.getTime())?String(value):d.toLocaleString('pt-BR'); }
  if (format === 'payment') return paymentLabels[String(value)] ?? String(value);
  if (format === 'boolean') return value ? 'Sim' : 'Não';
  if (format === 'json') return typeof value==='string'?value:JSON.stringify(value);
  return String(value);
}

function sum(rows:Row[], key?:string) { return key ? rows.reduce((total,row)=>total+Number(row[key]??0),0) : 0; }

export function ReportWorkspace({ report, branches, initial }: { report:string; branches:Row[]; initial:{ok?:boolean;error?:string;data?:Row[];start?:string;end?:string} }) {
  const def=reportDefinitions[report];
  const [start,setStart]=useState(String(initial.start??''));
  const [end,setEnd]=useState(String(initial.end??''));
  const [branch,setBranch]=useState('');
  const [rows,setRows]=useState<Row[]>(initial.data??[]);
  const [search,setSearch]=useState('');
  const [message,setMessage]=useState(initial.error?String(initial.error):'');
  const [loading,setLoading]=useState(false);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();if(!q)return rows;return rows.filter(row=>Object.values(row).some(v=>String(v??'').toLowerCase().includes(q)));},[rows,search]);

  async function generate(){setLoading(true);const result=await erpReportV2(report,def.period===false?undefined:start,def.period===false?undefined:end,def.branch===false?undefined:branch);setLoading(false);if(result.ok){setRows(result.data??[]);setMessage(`Relatório atualizado: ${(result.data??[]).length} linha(s).`);}else setMessage(`Não foi possível gerar: ${String(result.error??'erro desconhecido')}`);}
  function csv(){const lines=[def.columns.map(c=>`"${c.label}"`).join(';'),...visible.map(row=>def.columns.map(c=>`"${formatValue(row[c.key],c.format).replaceAll('"','""')}"`).join(';'))];const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`thor-${report}-${end||'relatorio'}.csv`;a.click();URL.revokeObjectURL(url);}

  return <div className="report-v2">
    <section className="erp-module-card report-v2-toolbar">
      <div className="report-v2-filters">
        {def.period!==false&&<><label>Início<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fim<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></>}
        {def.branch!==false&&<label>Filial<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas as filiais</option>{branches.map(b=><option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>)}</select></label>}
        <button className="erp-primary" onClick={generate} disabled={loading}>{loading?'Gerando...':'Gerar relatório'}</button>
      </div>
      <div className="report-v2-actions"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filtrar resultado..."/><button className="erp-ghost" onClick={csv}>Exportar CSV</button><button className="erp-ghost" onClick={()=>window.print()}>Imprimir / PDF</button></div>
      {def.note&&<p className="report-v2-note">{def.note}</p>}
      {message&&<p className="erp-message">{message}</p>}
    </section>
    <section className="report-v2-metrics">{def.metrics.map((metric,i)=>{const value=metric.count?visible.length:sum(visible,metric.key);return <article key={i}><span>{metric.label}</span><strong>{metric.count?value:formatValue(value,metric.format)}</strong><small>{search?'resultado filtrado':'período selecionado'}</small></article>})}</section>
    <section className="erp-module-card report-v2-table-card"><div className="report-v2-title"><div><h2>{def.title}</h2><p>{visible.length} linha(s) exibida(s)</p></div></div><div className="erp-table-scroll"><table className="erp-data-table"><thead><tr>{def.columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{visible.length===0?<tr><td className="erp-empty" colSpan={def.columns.length}>Nenhum dado encontrado para os filtros informados.</td></tr>:visible.map((row,index)=><tr key={String(row.id??`${report}-${index}`)}>{def.columns.map(c=><td key={c.key} className={c.format==='money'&&Number(row[c.key]??0)<0?'report-negative':''}>{formatValue(row[c.key],c.format)}</td>)}</tr>)}</tbody></table></div></section>
  </div>;
}
