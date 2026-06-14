import { contextBridge, ipcRenderer } from 'electron'

// The only bridge between renderer and main. No key, no provider client, no
// network is ever exposed to the renderer — just these calls.
const api = {
  transform: (payload) => ipcRenderer.invoke('transform', payload),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  hasKey: (provider) => ipcRenderer.invoke('key:has', provider),
  setKey: (provider, key) => ipcRenderer.invoke('key:set', provider, key)
}

contextBridge.exposeInMainWorld('api', api)
