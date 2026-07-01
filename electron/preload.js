const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
  },
  api: {
    request: (method, path, body) => ipcRenderer.invoke('api:request', { method, path, body }),
  },
  kanban: {
    request: (method, path, body) => ipcRenderer.invoke('kanban:request', { method, path, body }),
  },
  jobs: {
    request: (method, path, body) => ipcRenderer.invoke('jobs:request', { method, path, body }),
  },
  ws: {
    connect: (profile) => ipcRenderer.invoke('ws:connect', { profile }),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('update-status', handler);
      return () => ipcRenderer.removeListener('update-status', handler);
    },
  },
  onGatewayEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('gateway:event', handler);
    return () => ipcRenderer.removeListener('gateway:event', handler);
  },
});
