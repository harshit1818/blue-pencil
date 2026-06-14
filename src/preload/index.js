import { contextBridge, ipcRenderer } from 'electron'

// The only bridge between renderer and main. No key, no provider client, no
// network is ever exposed to the renderer — just these calls.
const api = {
  transform: (payload) => ipcRenderer.invoke('transform', payload),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  hasKey: (provider) => ipcRenderer.invoke('key:has', provider),
  setKey: (provider, key) => ipcRenderer.invoke('key:set', provider, key),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setProvider: (id) => ipcRenderer.invoke('settings:setProvider', id),
  setModel: (id, model) => ipcRenderer.invoke('settings:setModel', id, model),
  onSettingsChanged: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('settings:changed', h)
    return () => ipcRenderer.removeListener('settings:changed', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
