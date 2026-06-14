import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

// A single reused, frameless, transparent, always-on-top popover window shown
// near the cursor on hotkey. Created lazily and hidden (not destroyed) between
// uses so its renderer state persists. Same preload as the main window.

let win = null
let rendererReady = false // the popover renderer has mounted + attached its listeners
let pendingText = null // text captured for a summon not yet delivered to the renderer

function create() {
  rendererReady = false
  win = new BrowserWindow({
    width: 340,
    height: 420,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('blur', hideOverlay) // clicking into another app dismisses
  win.on('closed', () => {
    win = null
    rendererReady = false
    pendingText = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popover.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popover.html'))
  }
  return win
}

function positionAtCursor() {
  const pt = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(pt)
  const [w, h] = win.getSize()
  let x = pt.x + 12
  let y = pt.y + 12
  // Flip across the cursor if we'd run off the right/bottom edge, then clamp.
  if (x + w > workArea.x + workArea.width) x = pt.x - w - 12
  if (y + h > workArea.y + workArea.height) y = pt.y - h - 12
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - w))
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - h))
  win.setPosition(Math.round(x), Math.round(y))
}

// Deliver the captured text only once the renderer is listening. This avoids the
// first-summon race: 'popover:show' fired on did-finish-load could land before
// the renderer's onPopoverShow listener was attached, dropping the first capture.
function flush() {
  if (!win || !rendererReady || pendingText === null) return
  const text = pendingText
  pendingText = null
  positionAtCursor()
  win.webContents.send('popover:show', { text })
  win.show()
  win.focus()
}

// Called (over IPC) when the popover renderer has mounted and attached listeners.
export function markRendererReady() {
  rendererReady = true
  flush()
}

export function showOverlayAtCursor(text) {
  if (!win) create()
  pendingText = text
  flush() // sends now if the renderer is ready; otherwise markRendererReady() will
}

export function hideOverlay() {
  if (win && win.isVisible()) win.hide()
}

export function resizeOverlay(w, h) {
  if (win) win.setContentSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

export function isOverlayVisible() {
  return Boolean(win && win.isVisible())
}
