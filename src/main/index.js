import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { transform } from './transform.js'
import { hasApiKey, setApiKey, seedFromEnv } from './keychain.js'

function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 660,
    minWidth: 560,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf8f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await seedFromEnv()

  // The renderer never touches the key or the network — only these channels.
  ipcMain.handle('transform', (_event, payload) => transform(payload))
  ipcMain.handle('key:has', () => hasApiKey())
  ipcMain.handle('key:set', (_event, key) => setApiKey(key))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
