import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createGesture } from './icon-gesture.js'
import { placeAtSlot, nearestSlot } from './overlay-slots.js'
import { getSettings, getOverlaySlot, setOverlaySlot } from './settings.js'
import { ICON_SIZE } from './icon-anchor.js'
import { log } from './log.js'

// The parked pencil icon: a tiny frameless non-activating always-on-top window
// at the shared overlay slot whenever the panel is folded. Click → summon (the
// callback runs the hotkey's grab while the source app is still frontmost —
// focusable:false is what keeps it frontmost). Drag → follow the mouse, snap to
// the nearest slot on release, persist it (the panel shares the same slot).
// Distinct from ghost-icon.js, which belongs to the AX field-anchor milestone.

let win = null
let onSummon = null
const gesture = createGesture()

function create() {
  win = new BrowserWindow({
    width: ICON_SIZE,
    height: ICON_SIZE,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false, // positioned only by us (gesture moveTo / slot snap)
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // never steals focus or key status from the target app
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver') // sit above fullscreen content
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('closed', () => {
    win = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/icon.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/icon.html'))
  }
  return win
}

// Park at the shared slot. workArea defaults to wherever the icon already is,
// so a fold from the overlay can pass that display's work area explicitly.
export function showParkIcon(workArea) {
  if (!getSettings().floatIcon) return
  if (!win) create()
  const a = workArea || screen.getDisplayMatching(win.getBounds()).workArea
  const r = placeAtSlot(getOverlaySlot(), { width: ICON_SIZE, height: ICON_SIZE }, a)
  win.setPosition(r.x, r.y)
  if (!win.isVisible()) win.showInactive()
}

export function hideParkIcon() {
  if (win && win.isVisible()) win.hide()
}

// icon:mouse IPC endpoint. The renderer is a dumb pipe; validate here (trust
// boundary) and let the gesture machine decide click vs drag.
export function onIconMouse(evt) {
  if (!win || !evt || !Number.isFinite(evt.x) || !Number.isFinite(evt.y)) return
  if (evt.type === 'down') {
    const [winX, winY] = win.getPosition()
    evt = { ...evt, winX, winY }
  }
  const action = gesture.feed(evt)
  if (!action) return
  if (action.type === 'moveTo') {
    win.setPosition(Math.round(action.x), Math.round(action.y))
  } else if (action.type === 'click') {
    log('park icon clicked -> summon')
    onSummon?.()
  } else if (action.type === 'dragEnd') {
    const b = win.getBounds()
    const { workArea } = screen.getDisplayMatching(b)
    const slot = nearestSlot(b, workArea)
    if (slot !== getOverlaySlot()) setOverlaySlot(slot)
    const r = placeAtSlot(slot, b, workArea)
    win.setPosition(r.x, r.y)
    log(`park icon snapped to ${slot}`)
  }
}

export function initParkIcon(summon) {
  onSummon = summon
  showParkIcon(screen.getPrimaryDisplay().workArea)
}
