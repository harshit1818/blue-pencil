import { globalShortcut, clipboard, BrowserWindow } from 'electron'
import { showOverlayAtCursor, hideOverlay, isOverlayVisible } from './overlay.js'

// Default accelerator; standard combos don't need Accessibility. Configurable later.
const ACCELERATOR = "CommandOrControl+Shift+'"

function onFire() {
  // Toggle: a second press while open dismisses.
  if (isOverlayVisible()) {
    hideOverlay()
    return
  }
  // Don't summon over our own UI (interaction-spec edge case).
  if (BrowserWindow.getFocusedWindow()) return

  // v0 "grab" seam — use whatever the user already copied. v1 replaces this with
  // synth-⌘C + pasteboard changeCount read (and records the frontmost app).
  showOverlayAtCursor(clipboard.readText())
}

export function registerHotkey() {
  globalShortcut.register(ACCELERATOR, onFire)
}

export function unregisterHotkey() {
  globalShortcut.unregisterAll()
}
