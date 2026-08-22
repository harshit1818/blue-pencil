import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { restoreClipboardIfPending } from './automation.js'
import { placeAtSlot, placeNearRect } from './overlay-slots.js'
import { snapToNearestSlot } from './slot-snap.js'
import { getOverlaySlot } from './settings.js'
import { showParkIcon, hideParkIcon } from './park-icon.js'
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
let pendingAnchor = null // icon rect this summon unfolds from, if it came from the field icon
let fieldAnchor = null // that rect for the panel currently shown (resize re-places against it)

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
    fieldAnchor = null
    // A destroyed panel (renderer crash, dev tooling) must not strand the icon
    // hidden — every panel-gone path ends with the icon back (or a no-op mid-quit).
    showParkIcon()
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
      if (!win || win.isDestroyed() || !win.isVisible()) return
      const slot = snapToNearestSlot(win)
      if (slot) log(`snapped to ${slot}`)
    }, 200)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popover.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popover.html'))
  }
  return win
}

// Place on the given work area: unfolded from the field icon when this summon
// came from it, else at the remembered slot. Placement is a pure function of
// (anchor-or-slot, size, workArea): a summon with last summon's stale size is
// corrected by the first popover:resize without the pinned corner moving (#8).
function position(workArea, width, height) {
  const r = fieldAnchor
    ? placeNearRect(fieldAnchor, { width, height }, workArea)
    : placeAtSlot(getOverlaySlot(), { width, height }, workArea)
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
  fieldAnchor = pendingAnchor
  pendingAnchor = null
  // Summon on the display the user is working on — the icon's own display when
  // unfolding from the field, else the cursor's (the best proxy). The slot name
  // or anchor re-resolves against that display's work area.
  const { workArea } = fieldAnchor
    ? screen.getDisplayMatching(fieldAnchor)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [w, h] = win.getContentSize()
  position(workArea, w, h)
  hideParkIcon() // the panel is the icon, unfolded — never both at once
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

// anchor: the field icon's rect when the summon came from it (#57), else unset.
export function showOverlayAtCursor(text, accessibility, markdown, anchor) {
  log(`showOverlayAtCursor (winExists=${Boolean(win)}, anchored=${Boolean(anchor)}, rendererReady=${rendererReady})`)
  blurDismissSuppressed = false // a fresh summon resumes normal blur-to-dismiss
  if (!win) create()
  pendingText = text
  pendingAccessibility = Boolean(accessibility)
  pendingMarkdown = Boolean(markdown)
  pendingAnchor = anchor || null
  flush() // sends now if the renderer is ready; otherwise markRendererReady() will
}

export function hideOverlay() {
  blurDismissSuppressed = false // Escape / toggle / paste-back is an explicit dismiss
  const alive = win && !win.isDestroyed() // blur can fire mid-teardown on quit
  if (alive && win.isVisible()) win.hide()
  // A grab that was never pasted should leave the user's clipboard as it was.
  restoreClipboardIfPending()
  const unfolded = fieldAnchor
  fieldAnchor = null
  // Fold back to the parked icon on the display the panel was on (no-op
  // mid-quit) — but not when the panel came from the field icon: that icon
  // returns on its own once the target app is frontmost again, and two pencils
  // at once is exactly the confusion the field anchor is meant to remove.
  if (!unfolded) showParkIcon(alive ? screen.getDisplayMatching(win.getBounds()).workArea : undefined)
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
  position(workArea, w, h)
}

export function isOverlayVisible() {
  return Boolean(win && win.isVisible())
}
