// Pure ghost-icon geometry + follow state — no electron imports, so it loads
// under plain `node --test` (same pattern as window-bounds.js). The F4 icon
// window (ghost-icon.js) executes the actions; this decides WHERE and WHEN.
//
// Geometry (docs/phase3/anchored-icon.md §Geometry): anchor rect = element
// frame ∩ owning window frame (the visible portion); icon at its inside
// bottom-right, inset to match the in-app badge (App.jsx: right 14, bottom 16).
// Hidden — never floating off the field — when the visible portion can't host
// the icon (R4).
//
// Follow state: consumes F2 helper events ({type:'focus'|'bounds'|'blur'})
// through the F3 filter (field-qualify.js), returns a single action —
// {type:'place',x,y} | {type:'hide'} | null. Bounds repositioning is throttled
// (leading + trailing) inside the 30–60ms band; focus/blur are never throttled.
// Time is injected as `now` (helper-lifecycle.js pattern) so tests drive it
// with plain numbers.

import { qualifies } from './field-qualify.js'

export const ICON_SIZE = 38
export const INSET = { right: 14, bottom: 16 }
// Hide-while-moving: an icon that chases a scroll always trails (AX frames lag
// the pixels, the helper polls at 250ms) — so hide during motion and reappear
// once the frame has been still this long. Must exceed the helper's 250ms poll
// or the icon flickers back between scroll polls.
export const SETTLE_MS = 400

function validRect(r) {
  return Boolean(
    r &&
      Number.isFinite(r.x) &&
      Number.isFinite(r.y) &&
      Number.isFinite(r.width) &&
      Number.isFinite(r.height) &&
      r.width > 0 &&
      r.height > 0
  )
}

export function intersectRects(a, b) {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const width = Math.min(a.x + a.width, b.x + b.width) - x
  const height = Math.min(a.y + a.height, b.y + b.height) - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

// Icon top-left for a field, or null when it shouldn't show: element scrolled
// out of its window, or the visible sliver is too small to host the icon.
export function iconPosition(frame, windowFrame, size = ICON_SIZE) {
  if (!validRect(frame)) return null
  const visible = validRect(windowFrame) ? intersectRects(frame, windowFrame) : frame
  if (!visible || visible.width < size || visible.height < size) return null
  // Inside bottom-right, inset like the badge; clamped so a shallow visible
  // portion pushes the icon up-left rather than out of it.
  const x = Math.max(visible.x, visible.x + visible.width - INSET.right - size)
  const y = Math.max(visible.y, visible.y + visible.height - INSET.bottom - size)
  return { x: Math.round(x), y: Math.round(y) }
}

export function createIconFollower({ settleMs = SETTLE_MS, settings = () => ({}) } = {}) {
  let anchored = false // a qualifying element currently has focus
  let lastMoveAt = -Infinity
  let pending = null // latest {frame, windowFrame} awaiting the settle window

  return {
    // A helper event arrived; returns the action to perform now (or null).
    event(evt, now) {
      if (!evt || typeof evt !== 'object') return null
      // Helper protocol carries the element rect as flat x/y/width/height on
      // the event itself, and the owning window's rect as evt.windowFrame.
      const frame = { x: evt.x, y: evt.y, width: evt.width, height: evt.height }
      if (evt.type === 'focus') {
        pending = null
        // R2 belt-and-braces: honor the helper's secure flag even before the
        // role check — a secure field never anchors, whatever its role string.
        anchored =
          !evt.secure &&
          qualifies(
            { role: evt.role, subrole: evt.subrole, bundleId: evt.bundleId, width: evt.width, height: evt.height },
            settings()
          )
        if (!anchored) return { type: 'hide' }
        const pos = iconPosition(frame, evt.windowFrame)
        return pos ? { type: 'place', ...pos } : { type: 'hide' }
      }
      if (evt.type === 'bounds') {
        if (!anchored) return null
        // In motion: hide now, remember only the latest frame for the settle.
        lastMoveAt = now
        pending = { frame, windowFrame: evt.windowFrame }
        return { type: 'hide' }
      }
      // axEnable fires the instant another app activates — hide before its
      // (possibly slow) focus resolution, so the icon never lingers over it.
      if (evt.type === 'blur' || evt.type === 'axEnable') {
        anchored = false
        pending = null
        return { type: 'hide' }
      }
      return null
    },
    // Clock tick: reappear at the final position once motion has settled.
    tick(now) {
      if (!pending || now - lastMoveAt < settleMs) return null
      const { frame, windowFrame } = pending
      pending = null
      const pos = iconPosition(frame, windowFrame)
      return pos ? { type: 'place', ...pos } : { type: 'hide' }
    }
  }
}
