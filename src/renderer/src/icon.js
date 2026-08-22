import { color } from '@tokens'

// The parked icon's page: the pencil badge (same visual as ghost-icon.js) plus
// raw mouse forwarding. No gesture logic here — main's icon-gesture.js decides
// click vs drag, so the renderer stays a dumb event pipe. Pointer capture keeps
// move/up arriving even when a fast drag outruns the window between IPC frames.

const badge = document.createElement('div')
badge.style.cssText = [
  'width:100vw', // viewport units: the body has no explicit height, % would collapse
  'height:100vh',
  'border-radius:50%',
  `background:${color.light.pencil}`,
  `color:${color.light.onPencil}`,
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'font:22px -apple-system',
  'cursor:pointer',
  '-webkit-user-select:none'
].join(';')
badge.textContent = '✎'
document.body.appendChild(badge)

const forward = (type, e) => window.api?.iconMouse?.({ type, x: e.screenX, y: e.screenY })
badge.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return // left button only: right/middle must not summon
  badge.setPointerCapture(e.pointerId)
  forward('down', e)
})
badge.addEventListener('pointermove', (e) => {
  if (e.buttons & 1) forward('move', e)
})
badge.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return
  forward('up', e)
})
