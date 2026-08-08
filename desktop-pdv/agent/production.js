const hardware = require('./hardware');

function ensureColumns(db) {
  const cols = new Set(db.prepare('pragma table_info(products)').all().map((x) => x.name));
  const add = (name, type, def = '') => { if (!cols.has(name)) db.exec(`alter table products add column ${name} ${type}${def ? ` default ${def}` : ''}`); };
  add('production_mode', 'text', "'stock'");
  add('production_printer', 'text', "''");
  add('production_sector', 'text', "''");
  add('production_description', 'text', "''");
  add('auto_print_production', 'integer', '1');
  add('production_yield', 'real', '1');
}

function kitchenText({ eventId, context, operator, product, item, notes }) {
  const lines = [];
  lines.push('THORPDV - ORDEM DE PRODUCAO');
  lines.push(String(context.branch_name || context.company_name || ''));
  lines.push('==========================================');
  lines.push(`PEDIDO: ${String(eventId || '').slice(0, 8).toUpperCase()}`);
  lines.push(`DATA: ${new Date().toLocaleString('pt-BR')}`);
  if (operator?.name) lines.push(`OPERADOR: ${operator.name}`);
  if (product.production_sector) lines.push(`SETOR: ${product.production_sector}`);
  lines.push('------------------------------------------');
  lines.push(`${Number(item.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} x ${product.name || item.name || 'ITEM'}`);
  if (product.production_description) {
    lines.push('');
    lines.push('PREPARO / OBSERVACAO DO PRODUTO:');
    lines.push(String(product.production_description));
  }
  if (notes) {
    lines.push('');
    lines.push('OBSERVACAO DO PEDIDO:');
    lines.push(String(notes));
  }
  lines.push('==========================================');
  lines.push('\n\n\n');
  return lines.join('\n');
}

function installProductionPrinting(ThorAgent) {
  const originalStart = ThorAgent.prototype.start;
  const originalFinalize = ThorAgent.prototype.finalizeSale;

  ThorAgent.prototype.start = async function (...args) {
    ensureColumns(this.store.db);
    if (!this.store.__productionPullWrapped) {
      const originalApply = this.store.applyPull.bind(this.store);
      this.store.applyPull = (data) => {
        originalApply(data);
        ensureColumns(this.store.db);
        const stmt = this.store.db.prepare(`update products set production_mode=?,production_printer=?,production_sector=?,production_description=?,auto_print_production=?,production_yield=? where id=?`);
        const tx = this.store.db.transaction(() => {
          for (const p of data.products || []) stmt.run(String(p.production_mode || 'stock'), String(p.production_printer || ''), String(p.production_sector || ''), String(p.production_description || ''), p.auto_print_production === false ? 0 : 1, Number(p.production_yield || 1), String(p.id));
        });
        tx();
      };
      this.store.__productionPullWrapped = true;
    }
    return originalStart.apply(this, args);
  };

  ThorAgent.prototype.finalizeSale = async function (payload) {
    const result = await originalFinalize.call(this, payload);
    const operator = this.currentOperator?.() || null;
    const context = (() => { try { return JSON.parse(this.store.get('context', '{}') || '{}'); } catch { return {}; } })();
    const outputs = [];
    for (const item of result.receipt?.items || []) {
      const product = this.store.product(String(item.product_id || ''));
      if (!product || String(product.production_mode || 'stock') !== 'on_demand') continue;

      // Produto preparado sob demanda não representa estoque pronto local.
      // A baixa real será feita nos insumos pelo Gestão ao sincronizar a venda.
      this.store.adjustInventory(String(item.product_id), Number(item.quantity || 0));

      if (Number(product.auto_print_production ?? 1) !== 1) {
        outputs.push({ productId: product.id, productName: product.name, skipped: true, reason: 'auto_print_disabled' });
        continue;
      }
      const printer = String(product.production_printer || '').trim();
      if (!printer) {
        outputs.push({ productId: product.id, productName: product.name, ok: false, error: 'production_printer_not_configured' });
        continue;
      }
      try {
        const content = kitchenText({ eventId: result.eventId, context, operator, product, item, notes: payload?.notes || '' });
        await hardware.printText(printer, content);
        outputs.push({ productId: product.id, productName: product.name, ok: true, printer });
      } catch (error) {
        outputs.push({ productId: product.id, productName: product.name, ok: false, printer, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { ...result, productionPrints: outputs };
  };
}

module.exports = { installProductionPrinting };
