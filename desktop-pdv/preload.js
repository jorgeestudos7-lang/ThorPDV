const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thor', {
  status: () => ipcRenderer.invoke('thor:status'),
  enroll: (payload) => ipcRenderer.invoke('thor:enroll', payload),
  sync: () => ipcRenderer.invoke('thor:sync'),
  searchProducts: (query) => ipcRenderer.invoke('thor:search-products', query),
  customers: (query) => ipcRenderer.invoke('thor:customers', query),
  openCash: (payload) => ipcRenderer.invoke('thor:open-cash', payload),
  cashMovement: (payload) => ipcRenderer.invoke('thor:cash-movement', payload),
  closeCash: (payload) => ipcRenderer.invoke('thor:close-cash', payload),
  finalizeSale: (payload) => ipcRenderer.invoke('thor:finalize-sale', payload),
  cancelSale: (payload) => ipcRenderer.invoke('thor:cancel-sale', payload),
  printers: () => ipcRenderer.invoke('thor:printers'),
  serialPorts: () => ipcRenderer.invoke('thor:serial-ports'),
  setPrinter: (name) => ipcRenderer.invoke('thor:set-printer', name),
  printLast: () => ipcRenderer.invoke('thor:print-last'),
});
