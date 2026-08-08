const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron');
const { ThorAgent } = require('./agent');
const { installThorAgentV3 } = require('./agent/v3');
const { installReturnFix } = require('./agent/v3-return');
const { installEnrollV3 } = require('./agent/v3-enroll');
const { installDataConsistency } = require('./agent/consistency');
const { installProfilePermissions } = require('./agent/v3-profile-permissions');
const { installSyncRecovery } = require('./agent/recovery');
const { installCashClosing } = require('./agent/cash-closing');
const { installProductionPrinting } = require('./agent/production');

installThorAgentV3(ThorAgent);
installReturnFix(ThorAgent);
installEnrollV3(ThorAgent);
installDataConsistency(ThorAgent);
installProfilePermissions(ThorAgent);
installSyncRecovery(ThorAgent);
installCashClosing(ThorAgent);
installProductionPrinting(ThorAgent);

let mainWindow;
let agent;

function codec() {
  return {
    encrypt(value) {
      if (!value) return '';
      if (!safeStorage.isEncryptionAvailable()) return `plain:${value}`;
      return `enc:${safeStorage.encryptString(value).toString('base64')}`;
    },
    decrypt(value) {
      if (!value) return '';
      if (value.startsWith('plain:')) return value.slice(6);
      if (!value.startsWith('enc:') || !safeStorage.isEncryptionAvailable()) return '';
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    },
  };
}

async function createWindow() {
  agent = new ThorAgent({
    dataDir: app.getPath('userData'),
    apiBase: process.env.THORPDV_API_URL || 'https://thorpdv.vercel.app',
    codec: codec(),
  });
  agent.sync.appVersion = '0.3.7';
  if (typeof agent.logoutOperator === 'function') agent.logoutOperator();
  await agent.start();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f4f6f5',
    title: 'ThorPDV Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function loadPrintable(doc) {
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true } });
  if (doc.kind === 'remote_pdf') {
    if (!/^https?:\/\//i.test(doc.url || '')) { win.destroy(); throw new Error('nfce_pdf_url_unavailable'); }
    await win.loadURL(doc.url);
  } else {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc.html || `<pre>${doc.text || ''}</pre>`)}`);
  }
  return win;
}

async function saveAsPdf(doc) {
  const win = await loadPrintable(doc);
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar documento como PDF',
      defaultPath: path.join(app.getPath('documents'), doc.filename || `ThorPDV-${Date.now()}.pdf`),
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    const buffer = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(result.filePath, buffer);
    return { ok: true, target: 'pdf', filePath: result.filePath };
  } finally { win.destroy(); }
}

async function printRemotePdf(doc, printerName) {
  const win = await loadPrintable(doc);
  try {
    return await new Promise((resolve, reject) => win.webContents.print({ silent: true, printBackground: true, deviceName: printerName }, (success, reason) => success ? resolve({ ok: true, target: printerName }) : reject(new Error(reason || 'print_failed'))));
  } finally { win.destroy(); }
}

async function printHtmlDocument(doc, printerName) {
  const win = await loadPrintable(doc);
  try {
    return await new Promise((resolve, reject) => win.webContents.print({ silent: true, printBackground: true, deviceName: printerName }, (success, reason) => success ? resolve({ ok: true, target: printerName }) : reject(new Error(reason || 'print_failed'))));
  } finally { win.destroy(); }
}

async function printSale(saleKey, type = 'pre_sale') {
  if (agent.currentOperator?.() && !agent.canPrint(type, false)) throw new Error(type === 'nfce' ? 'nfce_print_not_allowed' : 'receipt_print_not_allowed');
  const doc = agent.documentData(saleKey, type);
  const target = agent.settings().printerName;
  if (!target) throw new Error('printer_not_configured');
  if (target === '__PDF__') return saveAsPdf(doc);
  if (doc.kind === 'remote_pdf') return printRemotePdf(doc, target);
  return agent.printDocument(saleKey, type);
}

async function printCashClose(summary) {
  const doc = agent.cashCloseDocument(summary);
  const target = agent.settings().printerName;
  if (!target) throw new Error('printer_not_configured');
  if (target === '__PDF__') return saveAsPdf(doc);
  return printHtmlDocument(doc, target);
}

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('thor:status', () => agent.status());
ipcMain.handle('thor:settings', () => agent.settings());
ipcMain.handle('thor:update-settings', (_event, settings) => agent.updateSettings(settings));
ipcMain.handle('thor:enroll', (_event, input) => agent.enroll(input));
ipcMain.handle('thor:sync', () => agent.syncNow());
ipcMain.handle('thor:products', (_event, query) => agent.searchProducts(query));
ipcMain.handle('thor:customers', (_event, query) => agent.searchCustomers(query));
ipcMain.handle('thor:quote-sale', (_event, items) => agent.quoteSale(items));
ipcMain.handle('thor:finalize-sale', (_event, sale) => agent.finalizeSale(sale));
ipcMain.handle('thor:open-cash', (_event, payload) => agent.openCash(payload));
ipcMain.handle('thor:cash-movement', (_event, payload) => agent.cashMovement(payload));
ipcMain.handle('thor:close-cash', (_event, payload) => agent.closeCash(payload));
ipcMain.handle('thor:printers', () => agent.listPrinters());
ipcMain.handle('thor:serial-ports', () => agent.listSerialPorts());
ipcMain.handle('thor:print-sale', (_event, saleKey, type) => printSale(saleKey, type));
ipcMain.handle('thor:print-cash-close', (_event, summary) => printCashClose(summary));
ipcMain.handle('thor:login-operator', (_event, payload) => agent.loginOperator(payload));
ipcMain.handle('thor:logout-operator', () => agent.logoutOperator());
ipcMain.handle('thor:current-operator', () => agent.currentOperator());
ipcMain.handle('thor:scale-read', (_event, payload) => agent.readScale(payload));
ipcMain.handle('thor:cash-drawer', () => agent.openCashDrawer());
ipcMain.handle('thor:sync-recovery', () => agent.recoverSyncQueue());
ipcMain.handle('thor:disconnect', () => agent.disconnectDevice());
ipcMain.handle('thor:cash-summary', () => agent.cashClosingSummary());
ipcMain.handle('thor:production-reprint', (_event, payload) => agent.reprintProduction(payload));
