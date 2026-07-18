import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampOverlay } from '../src/main/overlay-clamp.js'

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
