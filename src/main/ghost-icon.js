import { BrowserWindow } from 'electron'
import { color } from '@tokens'
import { createIconFollower, ICON_SIZE } from './icon-anchor.js'
import { getSettings } from './settings.js'
import { showParkIcon, hideParkIcon } from './park-icon.js'
import { isOverlayVisible } from './overlay.js'
import { log } from './log.js'

// The F4 ghost icon: a tiny frameless non-activating always-on-top window that
// sits at the inside bottom-right of the focused field's visible portion and
// follows it. All placement/filter decisions live in icon-anchor.js; this file
// only owns the BrowserWindow. onHelperEvent() is the single entry point — the
// F2b wiring (#78) feeds it parsed helper events.
//
// Clicking it unfolds the panel (#57). The click is read straight off the
// window's own input stream — no preload, no IPC channel, so no new surface a
// faked renderer message could reach (park-icon.js needs that machinery only
// because it also drags). focusable:false + showInactive() keep the target app
// frontmost, which is what lets the summon's synthesized ⌘C land in it.

let win = null
let timer = null
let onClick = null
const follower = createIconFollower({ settings: getSettings, selfPid: process.pid })

// Static visual matching the in-app badge — no preload, no renderer entry.
const page = `<body style="margin:0;overflow:hidden;-webkit-user-select:none">
  <div style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;border-radius:50%;
    background:${color.light.pencil};color:${color.light.onPencil};
    display:flex;align-items:center;justify-content:center;
    font:16px -apple-system;box-shadow:0 2px 8px rgba(0,0,0,.25)">&#x270E;</div>
</body>`

function create() {
  win = new BrowserWindow({
    width: ICON_SIZE,
    height: ICON_SIZE,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // never steals focus or key status from the target app
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.setAlwaysOnTop(true, 'screen-saver') // sit above fullscreen content (R5)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.on('input-event', (_e, input) => {
    // Electron's InputEvent carries no button, so any release on the icon
    // summons — unlike the parked icon, whose renderer can filter to the left
    // button. On a 38px badge a right-click opening the panel is harmless.
    if (input.type !== 'mouseUp' || !onClick) return
    const anchor = win.getBounds()
    win.hide() // the panel is this icon, unfolded — never both at once
    log('ghost icon clicked -> summon')
    onClick(anchor)
  })
  win.on('closed', () => {
    win = null
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  return win
}

function run(action) {
  if (!action) return
  if (action.type === 'hide') {
    // Transitions only — a hide arrives on every bounds event, so logging each
    // one would flood the log during a scroll. A visible→hidden pair here is
    // exactly what "the icon blinked" looks like.
    if (win && win.isVisible()) {
      log('ghost icon hidden')
      win.hide()
    }
    // The field is really gone (not just scrolling — a hide arrives on every
    // bounds event) → the parked launcher is the pencil again, unless the panel
    // itself is open, in which case IT is the icon, unfolded.
    // ponytail: an unfolded panel dismissed while no field has focus leaves no
    // pencil until the next helper focus/blur event — in practice the user's next
    // click into a field or switch of app. The hotkey works throughout.
    if (!follower.isAnchored() && !isOverlayVisible()) showParkIcon()
    return
  }
  if (!win) create()
  hideParkIcon() // exactly one pencil: the field icon owns it while a field is focused
  win.setPosition(action.x, action.y)
  // showInactive: visible without activating us, so the target app keeps key
  // status — same discipline as overlay.js, minus the focus() the overlay needs.
  if (!win.isVisible()) {
    log(`ghost icon shown at (${action.x},${action.y})`)
    win.showInactive()
  }
}

function flush() {
  const action = follower.tick(Date.now())
  if (action) run(action)
  // Fired early (timer skew) with motion still pending? Re-arm instead of
  // silently leaving the icon hidden forever.
  else if (follower.hasPending()) timer = setTimeout(flush, 30)
}

export function onHelperEvent(evt) {
  run(follower.event(evt, Date.now()))
  // Re-arm the settle flush only for motion: the stream also carries
  // non-positional events (error, future readValue/verifyFocus responses)
  // which must not postpone the icon's reappearance.
  if (evt?.type === 'bounds') {
    clearTimeout(timer)
    timer = setTimeout(flush, follower.settleMs + 10)
  }
}

// The click handler is wired once at startup (index.js); the window itself is
// created lazily on the first placement.
export function initGhostIcon(handler) {
  onClick = handler
}

export function destroyGhostIcon() {
  clearTimeout(timer)
  if (win) win.destroy()
}
