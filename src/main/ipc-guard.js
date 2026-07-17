// Sensitive-IPC guard (#39). Pure logic, no electron imports, so it loads under
// plain `node --test` — index.js passes ipcMain and the real deps in.
//
// The destructive endpoints (key overwrite, keystroke synthesis into the
// frontmost app, relaunch) were plain IPC: main performed them for whichever
// renderer asked. Honour them only for the top frame of one of our own pages
// (same 'allow' classification as the #37 navigation guard, so "our own page"
// has a single definition), and paste-back only while the overlay is on screen.
import { classifyNavigation } from './navigation-guard.js'

export function isTrustedFrame(frame, opts) {
  if (!frame || frame.parent !== null) return false
  return classifyNavigation(frame.url, opts) === 'allow'
}

export function guardSensitiveIpc(ipcMain, opts, deps) {
  const trusted = (event) => isTrustedFrame(event.senderFrame, opts)

  ipcMain.handle('key:set', (event, provider, key) => {
    if (!trusted(event)) return false
    return deps.setApiKey(provider, key)
  })

  // v1 deliver seam (granted): paste the result into the source app, then dismiss.
  ipcMain.handle('hotkey:pasteBack', async (event, text, markdown) => {
    if (!trusted(event) || !deps.isOverlayVisible()) return
    await deps.pasteBack(text, { markdown })
    deps.hideOverlay()
  })

  ipcMain.on('accessibility:relaunch', (event) => {
    if (trusted(event)) deps.relaunchApp()
  })
}
