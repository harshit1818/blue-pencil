import { execFile } from 'child_process'
import { clipboard, systemPreferences, shell, app } from 'electron'

// v1 "works-now" automation via osascript / System Events — no native addon.
// Trade-off vs a native module: synthesizing keystrokes this way can trigger a
// one-time macOS "Automation" prompt (control System Events) on top of the
// Accessibility one. It's all isolated here so it can later be swapped for a
// native module behind grabSelection() / pasteBack() without touching the UI.

function osa(script) {
  return new Promise((resolve, reject) => {
    // Generous timeout so a first-run permission prompt isn't cut off.
    execFile('osascript', ['-e', script], { timeout: 20000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve((stdout || '').trim())
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function isAccessibilityGranted() {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

export function requestAccessibility() {
  // Triggers the system Accessibility prompt if not already trusted.
  return systemPreferences.isTrustedAccessibilityClient(true)
}

export function openAccessibilitySettings() {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
}

export function relaunchApp() {
  app.relaunch()
  app.quit()
}

async function frontmostApp() {
  try {
    return await osa(
      'tell application "System Events" to get name of first application process whose frontmost is true'
    )
  } catch {
    return null
  }
}

async function keyCmd(letter) {
  await osa(`tell application "System Events" to keystroke "${letter}" using command down`)
}

// Stash for the in-flight grab, consumed by pasteBack() or restoreClipboardIfPending().
let pending = null // { savedClipboard, frontApp }

// v1 GRAB seam — synthesize ⌘C while the source app is still frontmost. Returns
// the selected text ('' if nothing was selected). Stashes the prior clipboard +
// source app so we can paste back and restore afterwards.
export async function grabSelection() {
  const savedClipboard = clipboard.readText()
  const frontApp = await frontmostApp()
  clipboard.writeText('') // sentinel: empty means ⌘C copied nothing
  try {
    await keyCmd('c')
  } catch {
    clipboard.writeText(savedClipboard) // permission denied — restore and bail
    pending = null
    return ''
  }
  let selection = ''
  for (let i = 0; i < 40; i++) {
    const cur = clipboard.readText()
    if (cur) {
      selection = cur
      break
    }
    await sleep(10) // ~400ms cap total — deterministic, no fixed guess
  }
  pending = { savedClipboard, frontApp }
  return selection
}

// v1 DELIVER seam — write the result, reactivate the source app, paste it, then
// restore the user's original clipboard.
export async function pasteBack(text) {
  const stash = pending
  pending = null
  clipboard.writeText(text ?? '')
  try {
    if (stash?.frontApp) {
      const name = String(stash.frontApp).replace(/"/g, '\\"')
      await osa(`tell application "System Events" to set frontmost of process "${name}" to true`)
      await sleep(120) // let activation settle before pasting
    }
    await keyCmd('v')
    await sleep(120) // let the paste consume the clipboard before we restore
  } catch {
    /* best effort */
  } finally {
    if (stash) clipboard.writeText(stash.savedClipboard)
  }
}

// If a grab happened but the popover was dismissed without pasting, put the
// user's original clipboard back (a cancelled grab shouldn't leave the selection).
export function restoreClipboardIfPending() {
  if (pending) {
    clipboard.writeText(pending.savedClipboard)
    pending = null
  }
}
