const os = require('os');
const crypto = require('crypto');
const { Store } = require('./store');
const { SyncEngine } = require('./sync');
const hardware = require('./hardware');

class ThorAgent {
  constructor({dataDir,apiBase,codec}){ this.store=new Store(dataDir); this.apiBase=apiBase; this.codec=codec; this.state={online:false,syncing:false}; this.sync=new SyncEngine({store:this.store,apiBase,tokenProvider:()=>this.deviceToken(),onState:(s)=>Object.assign(this.state,s)}); }
  deviceToken(){ return this.codec.decrypt(this.store.get('device_token')); }
  async start(){ if(this.deviceToken()) this.sync.start(); }
  async stop(){ this.sync.stop(); this.store.close(); }
  async status(){ return { enrolled:Boolean(this.deviceToken()), online:this.state.online, syncing:this.state.syncing, context:JSON.parse(this.store.get('context','{}')||'{}'), queue:this.store.queueStats(), lastSyncAt:this.store.get('last_sync_at')||null, lastError:this.store.get('last_sync_error')||null, cashOpenEventId:this.store.get('cash_open_event_id')||null, printer:this.store.get('printer_name')||null, apiBase:this.apiBase }; }
  async enroll({code,name}){ const body={code,machineId:hardware.machineId(),name:name||`ThorPDV - ${os.hostname()}`,hostname:os.hostname(),appVersion:'0.1.0',capabilities:{offline:true,printing:process.platform==='win32',serial:process.platform==='win32'}}; const response=await fetch(`${this.apiBase}/api/pdv/enroll`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await response.json(); if(!response.ok||!data.ok) throw new Error(data.error||'enrollment_failed'); this.store.set('device_token',this.codec.encrypt(data.device_token)); this.store.set('device_id',data.device_id); this.sync.start(); await this.sync.run(); return this.status(); }
  async syncNow(){ return this.sync.run(); }
  searchProducts(q){ return this.store.searchProducts(q); }
  searchCustomers(q){ return this.store.searchCustomers(q); }

  resolvePrice(product,qty){ let price=Number(product.base_price||product.sale_price||0); for(const promo of this.store.promotions()){ const r=promo.rules||{}; const min=Number(r.min_qty||1); if(qty<min) continue; if(r.product_id && r.product_id!==product.id) continue; if(r.group_id && r.group_id!==product.group_id) continue; const discount=Number(r.discount_value||0); const candidate=r.discount_type==='fixed'?Math.max(price-discount,0):Math.max(price*(1-discount/100),0); price=Math.min(price,candidate); } return Math.round(price*100)/100; }
  quoteSale(items=[],discount=0){
    if(!Array.isArray(items)||!items.length) return {items:[],subtotal:0,discount:0,total:0};
    let subtotal=0; const resolved=[];
    for(const item of items){
      const p=this.store.product(item.productId); if(!p||!p.active) throw new Error('product_not_found');
      const qty=Number(item.quantity||0); if(qty<=0) throw new Error('invalid_quantity');
      const price=this.resolvePrice(p,qty); const itemDiscount=Math.max(Number(item.discount||0),0); const line=Math.max(qty*price-itemDiscount,0);
      subtotal+=line; resolved.push({productId:p.id,name:p.name,sku:p.sku,unit:p.unit,quantity:qty,unitPrice:price,discount:itemDiscount,total:line,stock:Number(p.quantity||0)});
    }
    const saleDiscount=Math.min(Math.max(Number(discount||0),0),subtotal); return {items:resolved,subtotal,discount:saleDiscount,total:Math.max(subtotal-saleDiscount,0)};
  }
  event(type,payload){ const e={id:crypto.randomUUID(),type,payload:{...payload,occurred_at:new Date().toISOString()}}; this.store.enqueue(e); this.sync.run().catch(()=>{}); return e; }
  async openCash({openingAmount=0,notes=''}){ if(this.store.get('cash_open_event_id')) throw new Error('cash_already_open'); const e=this.event('cash_open',{opening_amount:Number(openingAmount)||0,notes}); this.store.set('cash_open_event_id',e.id); return {ok:true,eventId:e.id}; }
  async cashMovement({movementType,amount,notes=''}){ if(!this.store.get('cash_open_event_id')) throw new Error('cash_not_open'); return {ok:true,eventId:this.event('cash_movement',{movement_type:movementType,amount:Number(amount)||0,notes}).id}; }
  async closeCash({closingAmount=0,notes=''}){ if(!this.store.get('cash_open_event_id')) throw new Error('cash_not_open'); const e=this.event('cash_close',{closing_amount:Number(closingAmount)||0,notes}); this.store.set('cash_open_event_id',''); return {ok:true,eventId:e.id}; }
  async finalizeSale({items,customerId=null,payments=[],discount=0,notes=''}){
    const cashOpenEventId=this.store.get('cash_open_event_id'); if(!cashOpenEventId) throw new Error('cash_not_open');
    const quote=this.quoteSale(items,discount); if(!quote.items.length) throw new Error('empty_cart');
    const normalizedPayments=(payments||[]).map(p=>({method:p.method,amount:Number(p.amount||0),provider:p.provider||null,external_id:p.externalId||null,txid:p.txid||null,metadata:p.metadata||{}})); const paid=normalizedPayments.reduce((s,p)=>s+p.amount,0); if(paid>quote.total+0.01) throw new Error('payment_exceeds_total');
    const payload={cash_open_event_id:cashOpenEventId,customer_id:customerId||null,items:quote.items.map(i=>({product_id:i.productId,quantity:i.quantity,unit_price:i.unitPrice,discount:i.discount})),payments:normalizedPayments,discount:quote.discount,notes}; const event=this.event('sale_completed',payload);
    for(const i of quote.items) this.store.adjustInventory(i.productId,-i.quantity);
    const receipt={eventId:event.id,items:quote.items.map(i=>({product_id:i.productId,quantity:i.quantity,unit_price:i.unitPrice,discount:i.discount,name:i.name,sku:i.sku,unit:i.unit})),subtotal:quote.subtotal,discount:quote.discount,total:quote.total,payments:normalizedPayments,customerId,createdAt:new Date().toISOString(),context:JSON.parse(this.store.get('context','{}')||'{}')}; this.store.saveReceipt(event.id,quote.total,receipt);
    return {ok:true,eventId:event.id,subtotal:quote.subtotal,total:quote.total,paid,receipt};
  }
  async cancelSale({saleClientEventId,saleId=null,reason=''}){ return {ok:true,eventId:this.event('sale_cancel',{sale_client_event_id:saleClientEventId||null,sale_id:saleId||null,reason}).id}; }
  async listPrinters(){ return hardware.listPrinters(); }
  async listSerialPorts(){ return hardware.listSerialPorts(); }
  setPrinter(name){ this.store.set('printer_name',name||''); return {ok:true}; }
  receiptText(receipt){ const r=receipt.payload||receipt; const lines=[]; lines.push('THORPDV'); lines.push(r.context?.company_name||''); lines.push(r.context?.branch_name||''); lines.push('------------------------------------------'); for(const i of r.items||[]) lines.push(`${i.quantity} x ${i.name}\n  ${i.unit_price.toFixed(2)} = ${(i.quantity*i.unit_price-i.discount).toFixed(2)}`); lines.push('------------------------------------------'); lines.push(`TOTAL: R$ ${Number(r.total||0).toFixed(2)}`); lines.push(`Data: ${new Date(r.createdAt||Date.now()).toLocaleString('pt-BR')}`); lines.push(`Evento: ${r.eventId||''}`); lines.push('\n\n'); return lines.join('\n'); }
  async printLastReceipt(){ const r=this.store.lastReceipt(); if(!r) throw new Error('receipt_not_found'); await hardware.printText(this.store.get('printer_name'),this.receiptText(r)); return {ok:true}; }
}
module.exports={ThorAgent};
