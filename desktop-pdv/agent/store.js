const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

class Store {
  constructor(dataDir) {
    this.db = new Database(path.join(dataDir, 'thorpdv-local.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      create table if not exists settings(key text primary key,value text);
      create table if not exists products(id text primary key,sku text,name text not null,unit text,group_id text,sale_price real not null default 0,active integer not null default 1,barcodes text not null default '[]',updated_at text);
      create index if not exists idx_products_name on products(name);
      create table if not exists inventory(product_id text primary key,quantity real not null default 0,reserved_quantity real not null default 0,updated_at text);
      create table if not exists price_items(product_id text primary key,price real not null);
      create table if not exists promotions(id text primary key,name text,rules text not null,valid_from text,valid_to text,updated_at text);
      create table if not exists customers(id text primary key,name text not null,document text,email text,phone text,active integer not null default 1,updated_at text);
      create index if not exists idx_customers_name on customers(name);
      create table if not exists queue(id text primary key,type text not null,payload text not null,state text not null default 'pending',attempts integer not null default 0,last_error text,created_at text not null,updated_at text not null);
      create index if not exists idx_queue_state on queue(state,created_at);
      create table if not exists receipts(id text primary key,event_id text not null,total real not null,payload text not null,server_sale_id text,server_number text,created_at text not null);
    `);
  }

  close() { this.db.close(); }
  get(key, fallback = '') { const row = this.db.prepare('select value from settings where key=?').get(key); return row ? row.value : fallback; }
  set(key, value) { this.db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(key, String(value ?? '')); }

  applyPull(data) {
    const tx = this.db.transaction(() => {
      const productStmt = this.db.prepare(`insert into products(id,sku,name,unit,group_id,sale_price,active,barcodes,updated_at) values(@id,@sku,@name,@unit,@group_id,@sale_price,@active,@barcodes,@updated_at)
        on conflict(id) do update set sku=excluded.sku,name=excluded.name,unit=excluded.unit,group_id=excluded.group_id,sale_price=excluded.sale_price,active=excluded.active,barcodes=excluded.barcodes,updated_at=excluded.updated_at`);
      for (const p of data.products || []) productStmt.run({ id:p.id, sku:p.sku || '', name:p.name, unit:p.unit || 'UN', group_id:p.group_id || '', sale_price:Number(p.sale_price||0), active:p.active===false?0:1, barcodes:JSON.stringify(p.barcodes||[]), updated_at:p.updated_at||'' });
      const stockStmt = this.db.prepare(`insert into inventory(product_id,quantity,reserved_quantity,updated_at) values(@product_id,@quantity,@reserved_quantity,@updated_at)
        on conflict(product_id) do update set quantity=excluded.quantity,reserved_quantity=excluded.reserved_quantity,updated_at=excluded.updated_at`);
      for (const i of data.inventory || []) stockStmt.run({ product_id:i.product_id, quantity:Number(i.quantity||0), reserved_quantity:Number(i.reserved_quantity||0), updated_at:i.updated_at||'' });
      const customerStmt = this.db.prepare(`insert into customers(id,name,document,email,phone,active,updated_at) values(@id,@name,@document,@email,@phone,@active,@updated_at)
        on conflict(id) do update set name=excluded.name,document=excluded.document,email=excluded.email,phone=excluded.phone,active=excluded.active,updated_at=excluded.updated_at`);
      for (const c of data.customers || []) customerStmt.run({ id:c.id, name:c.name, document:c.document||'', email:c.email||'', phone:c.phone||'', active:c.active===false?0:1, updated_at:c.updated_at||'' });
      this.db.prepare('delete from price_items').run();
      const priceStmt = this.db.prepare('insert into price_items(product_id,price) values(?,?)');
      for (const p of data.price_items || []) priceStmt.run(p.product_id, Number(p.price||0));
      this.db.prepare('delete from promotions').run();
      const promoStmt = this.db.prepare('insert into promotions(id,name,rules,valid_from,valid_to,updated_at) values(?,?,?,?,?,?)');
      for (const p of data.promotions || []) promoStmt.run(p.id,p.name||'',JSON.stringify(p.rules||{}),p.valid_from||'',p.valid_to||'',p.updated_at||'');
      if (data.context) this.set('context', JSON.stringify(data.context));
      if (data.cursor) this.set('cursor', data.cursor);
    });
    tx();
  }

  searchProducts(query = '', limit = 50) {
    const q = String(query).trim().toLowerCase();
    if (!q) return this.db.prepare(`select p.*,coalesce(i.quantity,0) quantity,coalesce(pi.price,p.sale_price) base_price from products p left join inventory i on i.product_id=p.id left join price_items pi on pi.product_id=p.id where p.active=1 order by p.name limit ?`).all(limit).map(this.inflateProduct);
    return this.db.prepare(`select p.*,coalesce(i.quantity,0) quantity,coalesce(pi.price,p.sale_price) base_price from products p left join inventory i on i.product_id=p.id left join price_items pi on pi.product_id=p.id where p.active=1 and (lower(p.name) like ? or lower(coalesce(p.sku,'')) like ? or lower(p.barcodes) like ?) order by case when lower(coalesce(p.sku,''))=? then 0 else 1 end,p.name limit ?`).all(`%${q}%`,`%${q}%`,`%${q}%`,q,limit).map(this.inflateProduct);
  }

  inflateProduct(row) { return { ...row, barcodes: JSON.parse(row.barcodes || '[]') }; }
  product(id) { const row=this.db.prepare(`select p.*,coalesce(i.quantity,0) quantity,coalesce(pi.price,p.sale_price) base_price from products p left join inventory i on i.product_id=p.id left join price_items pi on pi.product_id=p.id where p.id=?`).get(id); return row?this.inflateProduct(row):null; }
  promotions() { return this.db.prepare('select * from promotions').all().map((p)=>({ ...p, rules:JSON.parse(p.rules||'{}') })); }
  searchCustomers(query='') { const q=`%${String(query).trim().toLowerCase()}%`; return this.db.prepare(`select * from customers where active=1 and (lower(name) like ? or lower(coalesce(document,'')) like ?) order by name limit 30`).all(q,q); }
  adjustInventory(productId, delta) { this.db.prepare(`insert into inventory(product_id,quantity,reserved_quantity,updated_at) values(?,?,0,?) on conflict(product_id) do update set quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).run(productId,Number(delta),new Date().toISOString()); }

  enqueue(event) { const now=new Date().toISOString(); this.db.prepare('insert into queue(id,type,payload,state,attempts,created_at,updated_at) values(?,?,?,\'pending\',0,?,?)').run(event.id,event.type,JSON.stringify(event.payload||{}),now,now); return event; }
  pending(limit=100) { return this.db.prepare(`select * from queue where state='pending' order by created_at,rowid limit ?`).all(limit).map((q)=>({ id:q.id,type:q.type,payload:JSON.parse(q.payload),attempts:q.attempts })); }
  markProcessed(id,result) { this.db.prepare(`update queue set state='synced',last_error=null,updated_at=? where id=?`).run(new Date().toISOString(),id); if (result?.sale_id) this.db.prepare('update receipts set server_sale_id=?,server_number=? where event_id=?').run(result.sale_id,String(result.number||''),id); }
  markRejected(id,error) { this.db.prepare(`update queue set state='rejected',attempts=attempts+1,last_error=?,updated_at=? where id=?`).run(String(error||'rejected'),new Date().toISOString(),id); }
  markRetry(id,error) { this.db.prepare(`update queue set attempts=attempts+1,last_error=?,updated_at=? where id=?`).run(String(error||'sync_error'),new Date().toISOString(),id); }
  queueStats() { return this.db.prepare(`select state,count(*) count from queue group by state`).all().reduce((a,r)=>(a[r.state]=r.count,a),{pending:0,rejected:0,synced:0}); }
  saveReceipt(eventId,total,payload) { const id=crypto.randomUUID(); this.db.prepare('insert into receipts(id,event_id,total,payload,created_at) values(?,?,?,?,?)').run(id,eventId,total,JSON.stringify(payload),new Date().toISOString()); this.set('last_receipt_id',id); return id; }
  lastReceipt() { const id=this.get('last_receipt_id'); const row=id?this.db.prepare('select * from receipts where id=?').get(id):null; return row?{...row,payload:JSON.parse(row.payload)}:null; }
}

module.exports = { Store };
