import { app, BrowserWindow, ipcMain, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { color } from '@tokens'
import { transform } from './transform.js'
import { listProviders } from './providers.js'
import { hasApiKey, setApiKey, seedFromEnv } from './keychain.js'

const paperFor = (win) =>
  nativeTheme.shouldUseDarkColors ? color.dark.paper : color.light.paper

function boundsFile() {
  return join(app.getPath('userData'), 'window-bounds.json')
}
function loadBounds() {
  try {
    return JSON.parse(readFileSync(boundsFile(), 'utf8'))
  } catch {
    return null
  }
}
function saveBounds(win) {
  try {
    writeFileSync(boundsFile(), JSON.stringify(win.getBounds()))
  } catch {
    /* best-effort */
  }
}

function createWindow() {
  const saved = loadBounds()
  const win = new BrowserWindow({
    width: saved?.width ?? 820,
    height: saved?.height ?? 660,
    x: saved?.x,
    y: saved?.y,
    minWidth: 560,
    minHeight: 480,
    show: false,
    // Native inset traffic-light controls — no painted chrome.
    titleBarStyle: 'hiddenInset',
    backgroundColor: paperFor(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('close', () => saveBounds(win))

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

  return win
}

app.whenReady().then(async () => {
  await seedFromEnv()

  // The renderer never touches the key or the network — only these channels.
  ipcMain.handle('transform', (_event, payload) => transform(payload))
  ipcMain.handle('providers:list', () => listProviders())
  ipcMain.handle('key:has', (_event, provider) => hasApiKey(provider))
  ipcMain.handle('key:set', (_event, provider, key) => setApiKey(provider, key))

  const win = createWindow()

  // Keep the native window background in step with system appearance so theme
  // changes don't flash the wrong paper colour. The renderer tracks the same
  // change via prefers-color-scheme.
  nativeTheme.on('updated', () => win.setBackgroundColor(paperFor()))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
