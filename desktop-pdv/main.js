const path = require('path');
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const { ThorAgent } = require('./agent');

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

function registerIpc() {
  const handle = (name, fn) => ipcMain.handle(name, async (_event, ...args) => fn(...args));
  handle('thor:status', () => agent.status());
  handle('thor:enroll', (payload) => agent.enroll(payload));
  handle('thor:sync', () => agent.syncNow());
  handle('thor:search-products', (query) => agent.searchProducts(query));
  handle('thor:customers', (query) => agent.searchCustomers(query));
  handle('thor:quote-sale', (items, discount) => agent.quoteSale(items, discount));
  handle('thor:open-cash', (payload) => agent.openCash(payload));
  handle('thor:cash-movement', (payload) => agent.cashMovement(payload));
  handle('thor:close-cash', (payload) => agent.closeCash(payload));
  handle('thor:finalize-sale', (payload) => agent.finalizeSale(payload));
  handle('thor:cancel-sale', (payload) => agent.cancelSale(payload));
  handle('thor:printers', () => agent.listPrinters());
  handle('thor:serial-ports', () => agent.listSerialPorts());
  handle('thor:set-printer', (name) => agent.setPrinter(name));
  handle('thor:print-last', () => agent.printLastReceipt());
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (agent) await agent.stop();
  if (process.platform !== 'darwin') app.quit();
});
