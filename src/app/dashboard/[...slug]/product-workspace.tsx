'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { erpGenerateProductBarcode, erpProductAddStock, erpProductList, erpProductSave } from './actions';

type Row = Record<string, unknown>;

type ProductDraft = {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  group_id: string;
  class_id: string;
  unit: string;
  is_weighable: boolean;
  ncm: string;
  cest: string;
  cfop_default: string;
  cost_price: string;
  sale_price: string;
  minimum_stock: string;
  stock_to_add: string;
  active: boolean;
};

const units = [
  ['UN','Unidade'],['KG','Quilograma'],['CX','Caixa'],['PC','Peça'],['PCT','Pacote'],['FD','Fardo'],
  ['LT','Litro'],['ML','Mililitro'],['G','Grama'],['M','Metro'],['M2','Metro quadrado'],['M3','Metro cúbico'],
] as const;

const blank = (): ProductDraft => ({
  sku:'', barcode:'', name:'', description:'', group_id:'', class_id:'', unit:'UN', is_weighable:false,
  ncm:'', cest:'', cfop_default:'', cost_price:'0', sale_price:'0', minimum_stock:'0', stock_to_add:'', active:true,
});

const text = (value: unknown) => value == null ? '' : String(value);
const num = (value: unknown) => Number(value || 0);
const money = (value: unknown) => num(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function rowToDraft(row: Row): ProductDraft {
  return {
    id:text(row.id), sku:text(row.sku), barcode:text(row.barcode), name:text(row.name), description:text(row.description),
    group_id:text(row.group_id), class_id:text(row.class_id), unit:text(row.unit)||'UN', is_weighable:Boolean(row.is_weighable),
    ncm:text(row.ncm), cest:text(row.cest), cfop_default:text(row.cfop_default), cost_price:text(row.cost_price||0),
    sale_price:text(row.sale_price||0), minimum_stock:text(row.minimum_stock||0), stock_to_add:'', active:row.active !== false,
  };
}

export function ProductWorkspace({ initialProducts, groups, classes }: { initialProducts: Row[]; groups: Row[]; classes: Row[] }) {
  const [products,setProducts] = useState(initialProducts);
  const [search,setSearch] = useState('');
  const [draft,setDraft] = useState<ProductDraft>(blank());
  const [open,setOpen] = useState(false);
  const [message,setMessage] = useState('');
  const [stockPrompt,setStockPrompt] = useState<{id:string;name:string;cost:number}|null>(null);
  const [stockQty,setStockQty] = useState('');
  const [pending,startTransition] = useTransition();

  const filteredClasses = useMemo(() => classes.filter(c => !draft.group_id || !c.group_id || text(c.group_id)===draft.group_id), [classes,draft.group_id]);
  const activeCount = products.filter(p=>p.active!==false).length;
  const weighableCount = products.filter(p=>Boolean(p.is_weighable)).length;
  const stockValue = products.reduce((sum,p)=>sum+num(p.stock)*num(p.cost_price),0);

  const refresh = (query=search) => startTransition(async()=>{
    const result = await erpProductList(query);
    if(result.ok) setProducts(result.data); else setMessage(text(result.error||'Não foi possível carregar os produtos.'));
  });

  const newProduct = () => { setDraft(blank()); setMessage(''); setOpen(true); };
  const editProduct = (row:Row) => { setDraft(rowToDraft(row)); setMessage(''); setOpen(true); };
  const set = <K extends keyof ProductDraft>(key:K,value:ProductDraft[K]) => setDraft(current=>({...current,[key]:value}));

  const generateBarcode = () => startTransition(async()=>{
    const result = await erpGenerateProductBarcode();
    if(!result.ok) return setMessage(text(result.error||'Não foi possível gerar o código.'));
    set('barcode',text(result.barcode));
  });

  const save = (event:FormEvent) => {
    event.preventDefault();
    startTransition(async()=>{
      setMessage('');
      const result = await erpProductSave({
        ...(draft.id?{id:draft.id}:{}), sku:draft.sku, barcode:draft.barcode, name:draft.name, description:draft.description,
        group_id:draft.group_id, class_id:draft.class_id, unit:draft.unit, is_weighable:draft.is_weighable,
        ncm:draft.ncm, cest:draft.cest, cfop_default:draft.cfop_default, cost_price:Number(draft.cost_price||0),
        sale_price:Number(draft.sale_price||0), minimum_stock:Number(draft.minimum_stock||0), stock_to_add:Number(draft.stock_to_add||0), active:draft.active,
      });
      if(!result.ok) return setMessage(text(result.error||'Não foi possível salvar o produto.'));
      const wasNew = !draft.id;
      const added = Number(result.stock_added||0);
      const id = text(result.id);
      const name = draft.name;
      const cost = Number(draft.cost_price||0);
      setOpen(false);
      setDraft(blank());
      await new Promise<void>(resolve=>{startTransition(async()=>{const list=await erpProductList(search);if(list.ok)setProducts(list.data);resolve();});});
      setMessage(`Produto ${wasNew?'cadastrado':'atualizado'} com sucesso${result.barcode?` • EAN ${text(result.barcode)}`:''}${added>0?` • estoque +${added}`:''}.`);
      if(wasNew && added<=0){ setStockQty(''); setStockPrompt({id,name,cost}); }
    });
  };

  const addStockAfter = () => {
    if(!stockPrompt) return;
    const quantity = Number(stockQty||0);
    if(quantity<=0) return setMessage('Informe uma quantidade maior que zero.');
    startTransition(async()=>{
      const result=await erpProductAddStock(stockPrompt.id,quantity,stockPrompt.cost);
      if(!result.ok) return setMessage(text(result.error||'Não foi possível adicionar o estoque.'));
      setStockPrompt(null);setStockQty('');setMessage(`Estoque adicionado: +${quantity}.`);const list=await erpProductList(search);if(list.ok)setProducts(list.data);
    });
  };

  return <div className="product-workspace">
    <section className="product-kpis">
      <article><span>Produtos</span><strong>{products.length}</strong><small>{activeCount} ativos</small></article>
      <article><span>Pesáveis</span><strong>{weighableCount}</strong><small>integrados à balança</small></article>
      <article><span>Valor em estoque</span><strong>{money(stockValue)}</strong><small>custo × saldo atual</small></article>
      <article><span>Cadastro</span><strong>Integrado</strong><small>preço • estoque • PDV • fiscal</small></article>
    </section>

    <section className="product-card">
      <div className="product-toolbar">
        <form onSubmit={e=>{e.preventDefault();refresh(search);}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por descrição, SKU ou código de barras..."/><button>Buscar</button></form>
        <button className="product-primary" onClick={newProduct}>+ Novo Produto</button>
      </div>
      {message && <div className="product-message">{message}</div>}
      <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Código</th><th>EAN</th><th>Produto</th><th>Un.</th><th>Tipo</th><th>Venda</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>
        {products.length===0?<tr><td colSpan={9} className="product-empty">Nenhum produto encontrado.</td></tr>:products.map(p=><tr key={text(p.id)}><td>{text(p.sku)||'—'}</td><td className="mono">{text(p.barcode)||'—'}</td><td><strong>{text(p.name)}</strong><small>{text(p.group_name)||'Sem grupo'}{p.class_name?` • ${text(p.class_name)}`:''}</small></td><td>{text(p.unit)||'UN'}</td><td>{p.is_weighable?<span className="product-pill weighable">⚖ Pesável</span>:<span className="product-pill">Comum</span>}</td><td><strong>{money(p.sale_price)}</strong></td><td>{num(p.stock).toLocaleString('pt-BR',{maximumFractionDigits:3})}</td><td><span className={`product-status ${p.active===false?'off':''}`}>{p.active===false?'Inativo':'Ativo'}</span></td><td><button className="product-link" onClick={()=>editProduct(p)}>Editar</button></td></tr>)}
      </tbody></table></div>
    </section>

    {open && <div className="product-modal-backdrop" onMouseDown={()=>setOpen(false)}><div className="product-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="product-modal-head"><div><small>CADASTRO INTEGRADO</small><h2>{draft.id?'Editar produto':'Novo produto'}</h2><p>Dados comerciais, pesagem, código de barras e estoque no mesmo fluxo.</p></div><button onClick={()=>setOpen(false)}>×</button></div>
      <form onSubmit={save}>
        <div className="product-section"><h3>Identificação</h3><div className="product-form-grid">
          <label><span>Código / SKU</span><input value={draft.sku} onChange={e=>set('sku',e.target.value)} placeholder="Ex.: PROD-001"/></label>
          <label className="barcode-field"><span>Código de barras / EAN</span><div><input value={draft.barcode} onChange={e=>set('barcode',e.target.value.replace(/\s/g,''))} placeholder="Digite ou gere automaticamente"/><button type="button" onClick={generateBarcode} disabled={pending}>Gerar automático</button></div><small>O código automático é EAN-13 interno. Use o EAN/GTIN oficial do fabricante quando existir.</small></label>
          <label className="wide"><span>Descrição do produto *</span><input required value={draft.name} onChange={e=>set('name',e.target.value)} /></label>
          <label className="wide"><span>Descrição complementar</span><textarea value={draft.description} onChange={e=>set('description',e.target.value)} rows={2}/></label>
          <label><span>Grupo</span><select value={draft.group_id} onChange={e=>{set('group_id',e.target.value);set('class_id','');}}><option value="">Sem grupo</option>{groups.filter(g=>g.active!==false).map(g=><option key={text(g.id)} value={text(g.id)}>{text(g.name)}</option>)}</select></label>
          <label><span>Classe</span><select value={draft.class_id} onChange={e=>set('class_id',e.target.value)}><option value="">Sem classe</option>{filteredClasses.filter(c=>c.active!==false).map(c=><option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
        </div></div>

        <div className="product-section"><h3>Unidade e pesagem</h3><div className="product-form-grid compact-grid">
          <label><span>Unidade de medida *</span><select value={draft.unit} onChange={e=>set('unit',e.target.value)}>{units.map(([code,label])=><option value={code} key={code}>{code} — {label}</option>)}</select></label>
          <label className="weighable-switch"><span>Produto pesável</span><button type="button" className={draft.is_weighable?'on':''} onClick={()=>{const next=!draft.is_weighable;set('is_weighable',next);if(next&&draft.unit==='UN')set('unit','KG');}}><i></i><b>{draft.is_weighable?'Sim, usar peso no PDV':'Não, quantidade normal'}</b></button><small>Quando ativo, o ThorPDV usa peso da balança ou permite informar o peso manualmente.</small></label>
        </div></div>

        <div className="product-section"><h3>Preços e estoque</h3><div className="product-form-grid">
          <label><span>Preço de custo</span><input type="number" min="0" step="0.01" value={draft.cost_price} onChange={e=>set('cost_price',e.target.value)}/></label>
          <label><span>Preço de venda *</span><input required type="number" min="0" step="0.01" value={draft.sale_price} onChange={e=>set('sale_price',e.target.value)}/></label>
          <label><span>Estoque mínimo</span><input type="number" min="0" step="0.001" value={draft.minimum_stock} onChange={e=>set('minimum_stock',e.target.value)}/></label>
          <label><span>{draft.id?'Entrada de estoque agora':'Estoque inicial (opcional)'}</span><input type="number" min="0" step="0.001" value={draft.stock_to_add} onChange={e=>set('stock_to_add',e.target.value)} placeholder="Deixe vazio para lançar depois"/><small>Esse valor gera uma entrada real no módulo de estoque.</small></label>
        </div></div>

        <div className="product-section"><h3>Fiscal</h3><div className="product-form-grid">
          <label><span>NCM</span><input value={draft.ncm} onChange={e=>set('ncm',e.target.value)} /></label>
          <label><span>CEST</span><input value={draft.cest} onChange={e=>set('cest',e.target.value)} /></label>
          <label><span>CFOP padrão</span><input value={draft.cfop_default} onChange={e=>set('cfop_default',e.target.value)} /></label>
          <label><span>Status</span><select value={draft.active?'true':'false'} onChange={e=>set('active',e.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        </div></div>

        <div className="product-modal-actions"><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className="product-primary" disabled={pending}>{pending?'Salvando...':'Salvar produto'}</button></div>
      </form>
    </div></div>}

    {stockPrompt && <div className="product-modal-backdrop"><div className="stock-question">
      <div className="stock-icon">▦</div><h2>Adicionar estoque agora?</h2><p>O produto <b>{stockPrompt.name}</b> foi cadastrado sem estoque inicial. Deseja fazer a primeira entrada agora?</p>
      <label><span>Quantidade</span><input autoFocus type="number" min="0.001" step="0.001" value={stockQty} onChange={e=>setStockQty(e.target.value)} placeholder="Ex.: 10"/></label>
      <div><button onClick={()=>setStockPrompt(null)}>Agora não</button><button className="product-primary" onClick={addStockAfter} disabled={pending}>{pending?'Adicionando...':'Adicionar estoque'}</button></div>
    </div></div>}
  </div>;
}
