import { app, BrowserWindow, ipcMain, shell, nativeTheme, clipboard } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { color } from '@tokens'
import { transform } from './transform.js'
import { listProviders, effectiveSettings, isValidProvider } from './providers.js'
import { setProviderId, setModelId } from './settings.js'
import { hasApiKey, setApiKey, seedFromEnv } from './keychain.js'
import { registerHotkey, unregisterHotkey } from './hotkey.js'
import { resizeOverlay, hideOverlay } from './overlay.js'

// After any settings write, push the effective snapshot to every window so they
// stay in sync. A no-op echo with one window today; the overlay just subscribes.
function broadcastSettings() {
  const snapshot = effectiveSettings()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('settings:changed', snapshot)
  }
}

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
  // transform returns a structured envelope so normalized error copy reaches the
  // renderer intact (a thrown handler error gets wrapped by Electron's IPC layer).
  ipcMain.handle('transform', async (_event, payload) => {
    try {
      return { ok: true, result: await transform(payload) }
    } catch (e) {
      return { ok: false, code: e?.code ?? null, message: e?.message || 'Something went wrong.' }
    }
  })
  ipcMain.handle('providers:list', () => listProviders())
  ipcMain.handle('key:has', (_event, provider) => hasApiKey(provider))
  ipcMain.handle('key:set', (_event, provider, key) => setApiKey(provider, key))

  ipcMain.handle('settings:get', () => effectiveSettings())
  ipcMain.handle('settings:setProvider', (_event, id) => {
    if (isValidProvider(id)) {
      setProviderId(id)
      broadcastSettings()
    }
    return effectiveSettings()
  })
  ipcMain.handle('settings:setModel', (_event, id, model) => {
    if (isValidProvider(id)) {
      setModelId(id, model)
      broadcastSettings()
    }
    return effectiveSettings()
  })

  // Hotkey overlay channels.
  ipcMain.on('popover:resize', (_event, w, h) => resizeOverlay(w, h))
  ipcMain.on('popover:dismiss', () => hideOverlay())
  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(text ?? ''))

  registerHotkey()

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

app.on('will-quit', unregisterHotkey)
