import { color } from '@tokens'

// The parked icon's page: the pencil badge (same visual as ghost-icon.js) plus
// raw mouse forwarding. No gesture logic here — main's icon-gesture.js decides
// click vs drag, so the renderer stays a dumb event pipe.

const badge = document.createElement('div')
badge.style.cssText = [
  'width:100%',
  'height:100%',
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

const forward = (type) => (e) => window.api?.iconMouse?.({ type, x: e.screenX, y: e.screenY })
window.addEventListener('mousedown', forward('down'))
window.addEventListener('mousemove', (e) => {
  if (e.buttons & 1) forward('move')(e)
})
window.addEventListener('mouseup', forward('up'))
