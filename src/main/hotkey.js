import { globalShortcut, BrowserWindow } from 'electron'
import { showOverlayAtCursor, hideOverlay, isOverlayVisible } from './overlay.js'
import { isAccessibilityGranted, grabSelection, readClipboardSelection } from './automation.js'
import { log } from './log.js'

// Default accelerator; standard combos don't need Accessibility to register.
const ACCELERATOR = "CommandOrControl+Shift+'"

// Grab-and-show, shared by the hotkey and both icons (all fire while the source
// app is still frontmost — the icon windows are non-activating). The in-flight
// guard makes a double-fire (icon double-click) a no-op: a second concurrent
// grab would clobber automation.js's single clipboard-restore stash.
// anchor: the field icon's rect when the click came from it — the panel then
// unfolds there instead of at the remembered slot (#57).
let grabbing = false
export async function summon(anchor) {
  if (grabbing) {
    log('summon skipped: a grab is already in flight')
    return
  }
  grabbing = true
  try {
    // v1 grab seam: when Accessibility is granted, auto-copy the selection (the
    // source app is still frontmost here, before the overlay shows). Otherwise
    // fall back to v0 — read whatever the user already copied. Both paths return
    // { text, markdown } (rich selections arrive as Markdown — Case 1).
    const granted = isAccessibilityGranted()
    const t0 = Date.now()
    const { text, markdown } = granted ? await grabSelection() : readClipboardSelection()
    log(`  -> grab done (granted=${granted}, ${Date.now() - t0}ms, chars=${text?.length ?? 0})`)
    showOverlayAtCursor(text, granted, markdown, anchor)
  } finally {
    grabbing = false
  }
}

async function onFire() {
  log('hotkey fired')
  // Toggle: a second press while open dismisses.
  if (isOverlayVisible()) {
    log('  -> overlay visible, hiding (toggle)')
    hideOverlay()
    return
  }
  // Don't summon over our own UI (interaction-spec edge case) — hotkey only:
  // clicking the parked icon is deliberate even while our window is focused.
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) {
    log(`  -> swallowed: our window is focused (title="${focused.getTitle()}")`)
    return
  }
  await summon()
}

export function registerHotkey() {
  const ok = globalShortcut.register(ACCELERATOR, onFire)
  log(`registerHotkey ${ACCELERATOR} -> ${ok ? 'ok' : 'FAILED (already taken?)'}`)
  return ok
}

export function unregisterHotkey() {
  globalShortcut.unregisterAll()
}
