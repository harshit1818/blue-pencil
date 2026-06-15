import { globalShortcut, BrowserWindow } from 'electron'
import { showOverlayAtCursor, hideOverlay, isOverlayVisible } from './overlay.js'
import { isAccessibilityGranted, grabSelection, readClipboardSelection } from './automation.js'

// Default accelerator; standard combos don't need Accessibility to register.
const ACCELERATOR = "CommandOrControl+Shift+'"

async function onFire() {
  // Toggle: a second press while open dismisses.
  if (isOverlayVisible()) {
    hideOverlay()
    return
  }
  // Don't summon over our own UI (interaction-spec edge case).
  if (BrowserWindow.getFocusedWindow()) return

  // v1 grab seam: when Accessibility is granted, auto-copy the selection (the
  // source app is still frontmost here, before the overlay shows). Otherwise
  // fall back to v0 — read whatever the user already copied. Both paths return
  // { text, markdown } (rich selections arrive as Markdown — Case 1).
  const granted = isAccessibilityGranted()
  const { text, markdown } = granted ? await grabSelection() : readClipboardSelection()
  showOverlayAtCursor(text, granted, markdown)
}

export function registerHotkey() {
  globalShortcut.register(ACCELERATOR, onFire)
}

export function unregisterHotkey() {
  globalShortcut.unregisterAll()
}
