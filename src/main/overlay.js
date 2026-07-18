import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { restoreClipboardIfPending } from './automation.js'
import { log } from './log.js'

// A single reused, frameless, transparent, always-on-top popover window shown
// near the cursor on hotkey. Created lazily and hidden (not destroyed) between
// uses so its renderer state persists. Same preload as the main window.

let win = null
let rendererReady = false // the popover renderer has mounted + attached its listeners
let blurDismissSuppressed = false // held up on purpose during the accessibility-enable flow
let pendingText = null // text captured for a summon not yet delivered to the renderer
let pendingAccessibility = false // whether that summon's grab was the auto (v1) path
let pendingMarkdown = false // whether the captured text is Markdown (rich grab — Case 1)

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
  win.setAlwaysOnTop(true, 'screen-saver') // sit above fullscreen content
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Clicking into another app dismisses — except mid enable-flow, where opening
  // System Settings blurs us and would otherwise hide the "Restart to enable"
  // footer before it can be read (#9).
  win.on('blur', () => {
    if (blurDismissSuppressed) return
    hideOverlay()
  })
  win.on('closed', () => {
    win = null
    rendererReady = false
    pendingText = null
  })
  // A webContents reload (crash recovery, dev HMR, DevTools ⌘R) detaches the
  // renderer's listeners, so readiness must track the load lifecycle, not just
  // the window's — otherwise the next summon flushes into a dead renderer and the
  // capture is dropped (#12).
  win.webContents.on('did-start-loading', () => {
    rendererReady = false
  })
  win.webContents.on('render-process-gone', () => {
    rendererReady = false
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
  const display = screen.getDisplayNearestPoint(pt)
  const { workArea } = display
  log(`positionAtCursor cursor=(${pt.x},${pt.y}) display=${display.id} workArea=${workArea.x},${workArea.y},${workArea.width}x${workArea.height}`)
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
  const accessibility = pendingAccessibility
  const markdown = pendingMarkdown
  pendingText = null
  positionAtCursor()
  win.webContents.send('popover:show', { text, accessibility, markdown })
  // showInactive() shows without activating the app, so summoning the overlay
  // doesn't pull the active Space to another display (the "opens on the other
  // screen, no overlay over fullscreen" bug). focus() then gives it key focus so
  // Escape/typing work. See docs/decisions/0002-menu-bar-accessory-overlay.md.
  win.showInactive()
  win.focus()
  const [x, y] = win.getPosition()
  log(`flush shown at (${x},${y}) on display=${screen.getDisplayMatching(win.getBounds()).id}`)
}

// Called (over IPC) when the popover renderer has mounted and attached listeners.
export function markRendererReady() {
  rendererReady = true
  flush()
}

export function showOverlayAtCursor(text, accessibility, markdown) {
  log(`showOverlayAtCursor (winExists=${Boolean(win)}, rendererReady=${rendererReady})`)
  blurDismissSuppressed = false // a fresh summon resumes normal blur-to-dismiss
  if (!win) create()
  pendingText = text
  pendingAccessibility = Boolean(accessibility)
  pendingMarkdown = Boolean(markdown)
  flush() // sends now if the renderer is ready; otherwise markRendererReady() will
}

export function hideOverlay() {
  blurDismissSuppressed = false // Escape / toggle / paste-back is an explicit dismiss
  if (win && win.isVisible()) win.hide()
  // A grab that was never pasted should leave the user's clipboard as it was.
  restoreClipboardIfPending()
}

// Called (over IPC) when the user starts the accessibility-enable flow: opening
// System Settings blurs the overlay, but the footer it just revealed must stay up.
export function suppressOverlayBlurDismiss() {
  blurDismissSuppressed = true
}

export function resizeOverlay(w, h) {
  if (win) win.setContentSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

export function isOverlayVisible() {
  return Boolean(win && win.isVisible())
}
