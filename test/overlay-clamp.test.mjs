import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clampOverlay, applyResize } from '../src/main/overlay-clamp.js'

const laptop = [{ workArea: { x: 0, y: 25, width: 1512, height: 920 } }]
const dual = [
  ...laptop,
  { workArea: { x: -1920, y: -300, width: 1920, height: 1080 } }
]
const size = { width: 340, height: 420 }

test('anchor with room places below-right with the gap', () => {
  const r = clampOverlay({ x: 200, y: 200 }, size, laptop)
  assert.deepEqual(r, { x: 212, y: 212, width: 340, height: 420 })
})

test('anchor near the bottom edge flips up, never past work-area bottom', () => {
  const r = clampOverlay({ x: 200, y: 900 }, size, laptop)
  assert.ok(r.y + r.height <= 25 + 920, `${r.y}+${r.height} past bottom`)
  assert.ok(r.y >= 25)
})

test('anchor near the right edge clamps x inside the work area', () => {
  const r = clampOverlay({ x: 1500, y: 200 }, size, laptop)
  assert.ok(r.x + r.width <= 1512, `${r.x}+${r.width} past right`)
  assert.ok(r.x >= 0)
})

test('anchor near the left/top edge stays inside', () => {
  const r = clampOverlay({ x: 0, y: 25 }, size, laptop)
  assert.ok(r.x >= 0 && r.y >= 25)
})

test('panel taller than the work area is capped to it', () => {
  const r = clampOverlay({ x: 200, y: 200 }, { width: 340, height: 5000 }, laptop)
  assert.equal(r.height, 920)
  assert.ok(r.y + r.height <= 25 + 920)
})

test('panel wider than the work area is capped to it', () => {
  const r = clampOverlay({ x: 200, y: 200 }, { width: 5000, height: 420 }, laptop)
  assert.equal(r.width, 1512)
  assert.ok(r.x + r.width <= 1512)
})

test('anchor on the secondary display clamps against that display, not primary', () => {
  const r = clampOverlay({ x: -100, y: -100 }, size, dual)
  assert.ok(r.x >= -1920 && r.x + r.width <= 0, `x ${r.x} not on secondary`)
  assert.ok(r.y >= -300 && r.y + r.height <= 780)
})

test('anchor outside every work area falls back to the nearest display', () => {
  const r = clampOverlay({ x: 5000, y: 5000 }, size, dual)
  assert.ok(r.x + r.width <= 1512 && r.y + r.height <= 945)
})

// #7: the panel is placed before the result exists, then grows by the result
// region (up to 280px, ActionPanel maxHeight) once it lands. Growing from a
// bottom-anchored placement pushed the deliver row (Paste back / Copy) under the
// screen edge, so the fix has to re-clamp on the resize, not only on the summon.
const BOTTOM = 25 + 920

function fakeWin(bounds) {
  const calls = { size: null, position: null }
  return {
    getBounds: () => bounds,
    setContentSize: (w, h) => (calls.size = [w, h]),
    setPosition: (x, y) => (calls.position = [x, y]),
    calls
  }
}

test('a resize that overflows the bottom pulls the overlay back inside', () => {
  // A bottom-anchored placement: positionAtCursor flipped the pre-result card up
  // across a low cursor. Heights are illustrative — any placement whose bottom is
  // within the growth of the result region reproduces it.
  const win = fakeWin({ x: 400, y: 540, width: 340, height: 328 })
  applyResize(win, { width: 340, height: 608 }, laptop)
  const [w, h] = win.calls.size
  const [x, y] = win.calls.position
  assert.deepEqual([w, h], [340, 608], 'requested size still applied')
  assert.ok(y + h <= BOTTOM, `${y}+${h} runs past the work-area bottom ${BOTTOM}`)
  assert.equal(x, 400, 'x is untouched when the width is unchanged')
})

test('a resize that already fits leaves the position alone', () => {
  const win = fakeWin({ x: 400, y: 100, width: 340, height: 328 })
  applyResize(win, { width: 340, height: 608 }, laptop)
  assert.deepEqual(win.calls.position, [400, 100])
})

test('a resize taller than the work area is capped inside it', () => {
  const win = fakeWin({ x: 400, y: 540, width: 340, height: 328 })
  applyResize(win, { width: 340, height: 5000 }, laptop)
  const [, h] = win.calls.size
  const [, y] = win.calls.position
  assert.equal(h, 920)
  assert.ok(y >= 25 && y + h <= BOTTOM)
})

test('a resize clamps against the display the overlay is on, not the primary', () => {
  const win = fakeWin({ x: -1800, y: 600, width: 340, height: 328 })
  applyResize(win, { width: 340, height: 608 }, dual)
  const [, h] = win.calls.size
  const [, y] = win.calls.position
  assert.ok(y + h <= -300 + 1080, `${y}+${h} past the secondary display's bottom`)
})

// Guards the bug itself, not just the geometry: overlay-clamp.js already had a
// correct bottom-edge clamp while overlay.js grew the window with a bare
// setContentSize and never repositioned. A tested helper nothing calls is how #7
// survived — so pin the wiring too.
test('overlay.js places and sizes only through the slot helper', () => {
  const src = readFileSync(new URL('../src/main/overlay.js', import.meta.url), 'utf8')
  assert.match(src, /placeAtSlot\(/, 'placement must route through placeAtSlot (work-area cap)')
  assert.equal(
    (src.match(/win\.setContentSize\(/g) || []).length,
    1,
    'sizing happens exactly once, inside positionAtSlot — a bare setContentSize skips the cap'
  )
})
