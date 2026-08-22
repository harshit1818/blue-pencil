import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { restoreClipboardIfPending } from './automation.js'
import { placeAtSlot, nearestSlot } from './overlay-slots.js'
import { getOverlaySlot, setOverlaySlot } from './settings.js'
import { log } from './log.js'

// A single reused, frameless, transparent, always-on-top popover window shown
// at a remembered snap slot on hotkey. Created lazily and hidden (not destroyed)
// between uses so its renderer state persists. Same preload as the main window.
// The user drags it by the preview header; on release it snaps to the nearest
// slot and that slot persists (overlay-slots.js owns the geometry).

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
  // Snap to the nearest slot once a drag settles. macOS fires 'moved' during a
  // drag too, so debounce; snapping while the mouse still holds the window would
  // yank it out of the user's hand. Programmatic placements land exactly on a
  // slot rect, so the handler no-ops on them.
  let snapTimer = null
  win.on('moved', () => {
    clearTimeout(snapTimer)
    snapTimer = setTimeout(() => {
      if (!win || !win.isVisible()) return
      const b = win.getBounds()
      const { workArea } = screen.getDisplayMatching(b)
      const slot = nearestSlot(b, workArea)
      if (slot !== getOverlaySlot()) setOverlaySlot(slot)
      const r = placeAtSlot(slot, b, workArea)
      if (r.x !== b.x || r.y !== b.y) {
        win.setPosition(r.x, r.y)
        log(`snapped to ${slot} at (${r.x},${r.y})`)
      }
    }, 200)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popover.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popover.html'))
  }
  return win
}

// Place at the remembered slot on the given work area. Placement is a pure
// function of (slot, size, workArea): a summon with last summon's stale size is
// corrected by the first popover:resize without the pinned corner moving (#8).
function positionAtSlot(workArea, width, height) {
  const r = placeAtSlot(getOverlaySlot(), { width, height }, workArea)
  win.setContentSize(r.width, r.height)
  win.setPosition(r.x, r.y)
  return r
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
  // Summon on the display the user is working on (cursor is the best proxy);
  // the slot name re-resolves against that display's work area.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [w, h] = win.getContentSize()
  positionAtSlot(workArea, w, h)
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

// The card changed size (result arrived, error row, …): re-place at the slot on
// the display the window is on. The pinned edges stay fixed, so growth moves
// toward screen centre and never pushes the deliver row off screen (#7).
export function resizeOverlay(w, h) {
  if (!win) return
  const { workArea } = screen.getDisplayMatching(win.getBounds())
  positionAtSlot(workArea, w, h)
}

export function isOverlayVisible() {
  return Boolean(win && win.isVisible())
}
