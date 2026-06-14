import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, nativeTheme, clipboard } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { color } from '@tokens'
import { transform } from './transform.js'
import { listProviders, effectiveSettings, isValidProvider } from './providers.js'
import { setProviderId, setModelId } from './settings.js'
import { hasApiKey, setApiKey, seedFromEnv } from './keychain.js'
import { registerHotkey, unregisterHotkey } from './hotkey.js'
import { resizeOverlay, hideOverlay, markRendererReady } from './overlay.js'
import { pasteBack, requestAccessibility, openAccessibilitySettings, relaunchApp } from './automation.js'

const HOTKEY_LABEL = "⌘⇧'"

let mainWindow = null
let tray = null

function broadcastSettings() {
  const snapshot = effectiveSettings()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('settings:changed', snapshot)
  }
}

const paperFor = () => (nativeTheme.shouldUseDarkColors ? color.dark.paper : color.light.paper)

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
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 820,
    height: saved?.height ?? 660,
    x: saved?.x,
    y: saved?.y,
    minWidth: 560,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: paperFor(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Menu-bar app: closing the window hides it (Quit lives in the tray). Save
  // bounds first so we capture size/position before hiding.
  mainWindow.on('close', (e) => {
    saveBounds(mainWindow)
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  mainWindow.show()
  // An accessory app must be brought to the foreground for its window to take
  // keyboard focus (so the textarea is typable).
  if (process.platform === 'darwin') app.focus({ steal: true })
  mainWindow.focus()
}

function createTray() {
  // Text-glyph menu-bar item (a designed template PNG is a later polish).
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Blue Pencil')
  tray.setTitle('✎')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Blue Pencil', click: showMainWindow },
      { label: `Shortcut: ${HOTKEY_LABEL}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Quit Blue Pencil',
        click: () => {
          app.isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

app.whenReady().then(async () => {
  app.isQuitting = false
  // Accessory (menu-bar) app: no Dock icon, owns no Space — so the hotkey overlay
  // floats over fullscreen apps without a Space switch. LSUIElement handles the
  // packaged build; this covers dev.
  if (process.platform === 'darwin') app.dock?.hide()

  await seedFromEnv()

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
  ipcMain.on('popover:ready', () => markRendererReady())
  ipcMain.on('popover:resize', (_event, w, h) => resizeOverlay(w, h))
  ipcMain.on('popover:dismiss', () => hideOverlay())
  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(text ?? ''))

  // v1 deliver seam (granted): paste the result into the source app, then dismiss.
  ipcMain.handle('hotkey:pasteBack', async (_event, text) => {
    await pasteBack(text)
    hideOverlay()
  })
  ipcMain.handle('accessibility:request', () => requestAccessibility())
  ipcMain.on('accessibility:openSettings', () => openAccessibilitySettings())
  ipcMain.on('accessibility:relaunch', () => relaunchApp())

  registerHotkey()
  createTray()
  createWindow() // created hidden; summoned via the tray or by being needed

  nativeTheme.on('updated', () => mainWindow?.setBackgroundColor(paperFor()))

  // First run (no key for any provider) → open the window so key entry works.
  const anyKey = (await Promise.all(listProviders().map((p) => hasApiKey(p.id)))).some(Boolean)
  if (!anyKey) showMainWindow()
})

app.on('window-all-closed', () => {
  // Menu-bar app: stay resident when the window closes. (A non-mac build would
  // quit, but this is a macOS tool.)
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', unregisterHotkey)
