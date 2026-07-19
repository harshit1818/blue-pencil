import { BrowserWindow } from 'electron'
import { color } from '@tokens'
import { createIconFollower, ICON_SIZE, THROTTLE_MS } from './icon-anchor.js'
import { getSettings } from './settings.js'

// The F4 ghost icon: a tiny frameless non-activating always-on-top window that
// sits at the inside bottom-right of the focused field's visible portion and
// follows it. All placement/filter decisions live in icon-anchor.js; this file
// only owns the BrowserWindow. onHelperEvent() is the single entry point — the
// F2b wiring (#78) feeds it parsed helper events. No click behavior yet (M1):
// the window ignores mouse events entirely; #57 makes it interactive.

let win = null
let timer = null
const follower = createIconFollower({ settings: getSettings })

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
  win.setIgnoreMouseEvents(true)
  win.on('closed', () => {
    win = null
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  return win
}

function run(action) {
  if (!action) return
  if (action.type === 'hide') {
    if (win && win.isVisible()) win.hide()
    return
  }
  if (!win) create()
  win.setPosition(action.x, action.y)
  // showInactive: visible without activating us, so the target app keeps key
  // status — same discipline as overlay.js, minus the focus() the overlay needs.
  if (!win.isVisible()) win.showInactive()
}

export function onHelperEvent(evt) {
  run(follower.event(evt, Date.now()))
  // One deferred flush per burst covers the trailing reposition; the follower
  // returns null from tick() when nothing is pending.
  clearTimeout(timer)
  timer = setTimeout(() => run(follower.tick(Date.now())), THROTTLE_MS)
}

export function destroyGhostIcon() {
  clearTimeout(timer)
  if (win) win.destroy()
}
