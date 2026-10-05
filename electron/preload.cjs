const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('financeDesktop', {
  companies: () => ipcRenderer.invoke('finance:companies'),
  status: () => ipcRenderer.invoke('finance:status'),
  startService: () => ipcRenderer.invoke('finance:start-service'),
  login: () => ipcRenderer.invoke('finance:login'),
  snapshot: (company, month) => ipcRenderer.invoke('finance:snapshot', company, month),
});
