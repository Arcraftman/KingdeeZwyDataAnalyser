const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  status: () => ipcRenderer.invoke('desktop:status'),
  startService: () => ipcRenderer.invoke('desktop:start-service'),
  openLogin: () => ipcRenderer.invoke('desktop:open-login'),
  restoreSession: () => ipcRenderer.invoke('desktop:restore-session'),
  completeLogin: () => ipcRenderer.invoke('desktop:complete-login'),
  companies: () => ipcRenderer.invoke('desktop:companies'),
  refresh: (company, month) => ipcRenderer.invoke('desktop:refresh', { company, month }),
});
