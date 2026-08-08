function getPath(obj, path, fallback = undefined) {
  return path.split('.').reduce((value, key) => (value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), obj) ?? fallback;
}

function installProfilePermissions(ThorAgent) {
  const originalFinalizeSale = ThorAgent.prototype.finalizeSale;
  const originalBeginPayment = ThorAgent.prototype.beginIntegratedPayment;
  const originalReadScale = ThorAgent.prototype.readScale;
  const originalOpenDrawer = ThorAgent.prototype.openDrawer;
  const originalRequestNfce = ThorAgent.prototype.requestNfce;
  const originalFiscalSales = ThorAgent.prototype.fiscalSales;
  const originalFiscalSale = ThorAgent.prototype.fiscalSale;
  const originalLoginOperator = ThorAgent.prototype.loginOperator;

  ThorAgent.prototype._profileAllows = function (path, fallback = false) {
    const operator = this.currentOperator?.();
    if (!operator) return fallback;
    return Boolean(getPath(operator.permissions || {}, path, fallback));
  };

  ThorAgent.prototype._requireProfilePermission = function (path, error = 'permission_denied') {
    const operator = this.currentOperator?.();
    if (!operator) throw new Error('operator_required');
    if (!this._profileAllows(path, false)) throw new Error(error);
    return operator;
  };

  ThorAgent.prototype.loginOperator = async function (payload = {}) {
    const localLogin = await originalLoginOperator.call(this, payload);
    const sync = await this.sync.run(true);

    if (sync?.ok) {
      try {
        const refreshedLogin = await originalLoginOperator.call(this, payload);
        return {
          ...refreshedLogin,
          sync: { ok: true, at: this.store.get('last_sync_at') || null },
        };
      } catch (error) {
        this.store.set('current_operator_id', '');
        throw error;
      }
    }

    return {
      ...localLogin,
      sync: { ok: false, offline: true, error: sync?.error || 'sync_unavailable' },
    };
  };

  ThorAgent.prototype.finalizeSale = async function (payload = {}) {
    const operator = this._requireProfilePermission('sale.create', 'operator_not_allowed_to_sell');
    if ((payload.customerId || payload.consumerDocument) && !this._profileAllows('customer.identify', true)) throw new Error('operator_not_allowed_to_identify_customer');
    for (const payment of payload.payments || []) {
      const method = String(payment.method || '');
      if (method && !this._profileAllows(`payment.${method}`, true)) throw new Error(`payment_method_not_allowed:${method}`);
      if (payment.integrated && !this._profileAllows('payment.integrated', true)) throw new Error('integrated_payment_not_allowed');
    }
    return originalFinalizeSale.call(this, { ...payload, operatorUserId: operator.id });
  };

  ThorAgent.prototype.beginIntegratedPayment = async function (payload = {}) {
    this._requireProfilePermission('payment.integrated', 'integrated_payment_not_allowed');
    const method = String(payload.method || '');
    if (method && !this._profileAllows(`payment.${method}`, true)) throw new Error(`payment_method_not_allowed:${method}`);
    return originalBeginPayment.call(this, payload);
  };

  ThorAgent.prototype.readScale = async function () {
    this._requireProfilePermission('hardware.scale', 'scale_not_allowed');
    return originalReadScale.call(this);
  };

  ThorAgent.prototype.manualOpenDrawer = async function () {
    this._requireProfilePermission('hardware.manual_drawer', 'manual_drawer_not_allowed');
    return originalOpenDrawer.call(this);
  };

  ThorAgent.prototype.requestNfce = async function (payload = {}) {
    this._requireProfilePermission('fiscal.request_nfce', 'nfce_request_not_allowed');
    return originalRequestNfce.call(this, payload);
  };

  ThorAgent.prototype.fiscalSales = function (query = '') {
    this._requireProfilePermission('fiscal.view', 'fiscal_menu_not_allowed');
    return originalFiscalSales.call(this, query);
  };

  ThorAgent.prototype.fiscalSale = function (key) {
    this._requireProfilePermission('fiscal.view', 'fiscal_menu_not_allowed');
    return originalFiscalSale.call(this, key);
  };

  ThorAgent.prototype.manualSync = async function () {
    const operator = this.currentOperator?.();
    if (operator && !this._profileAllows('sync.manual', true)) throw new Error('manual_sync_not_allowed');
    return this.sync.run(true);
  };

  ThorAgent.prototype.canPrint = function (type = 'pre_sale', reprint = false) {
    if (reprint && !this._profileAllows('print.reprint', true)) return false;
    if (type === 'nfce') return this._profileAllows('print.nfce', true);
    return this._profileAllows('print.receipt', true);
  };
}

module.exports = { installProfilePermissions };
