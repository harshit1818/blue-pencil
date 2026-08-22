// Pure click-vs-drag discrimination for the parked icon — no electron imports,
// so it loads under plain `node --test`. The icon window is a drag region AND a
// button, which WebkitAppRegion can't express (drag regions swallow clicks), so
// the renderer forwards raw mouse events and this machine decides: a press that
// never travels past the threshold is a click; one that does drags the window
// (preserving the grab offset) and ends in dragEnd, never click.

export function createGesture({ threshold = 4 } = {}) {
  let start = null // { x, y, offsetX, offsetY }
  let dragging = false

  return {
    feed(evt) {
      if (evt.type === 'down') {
        start = { x: evt.x, y: evt.y, offsetX: evt.winX - evt.x, offsetY: evt.winY - evt.y }
        dragging = false
        return null
      }
      if (!start) return null
      if (evt.type === 'move') {
        if (!dragging && Math.hypot(evt.x - start.x, evt.y - start.y) < threshold) return null
        dragging = true
        return { type: 'moveTo', x: evt.x + start.offsetX, y: evt.y + start.offsetY }
      }
      if (evt.type === 'up') {
        const wasDragging = dragging
        start = null
        dragging = false
        return { type: wasDragging ? 'dragEnd' : 'click' }
      }
      return null
    }
  }
}
