import { contextBridge, ipcRenderer } from 'electron'

// The only bridge between renderer and main. No key, no provider, no network
// is ever exposed to the renderer — just these three calls.
const api = {
  transform: (payload) => ipcRenderer.invoke('transform', payload),
  hasKey: () => ipcRenderer.invoke('key:has'),
  setKey: (key) => ipcRenderer.invoke('key:set', key)
}

contextBridge.exposeInMainWorld('api', api)
