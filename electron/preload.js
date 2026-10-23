const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
  loadData: (key) => ipcRenderer.invoke('load-data', key),
  // Anexos de cheques (Fase 4 PLAN_CHEQUES.md): binarios locales por IPC.
  saveAttachment: (key, base64) => ipcRenderer.invoke('save-attachment', key, base64),
  loadAttachment: (key) => ipcRenderer.invoke('load-attachment', key),
  deleteAttachment: (key) => ipcRenderer.invoke('delete-attachment', key)
});
