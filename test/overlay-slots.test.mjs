import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SLOTS, placeAtSlot, nearestSlot, normalizeSlot } from '../src/main/overlay-slots.js'

const wa = { x: 0, y: 25, width: 1512, height: 920 }
const size = { width: 340, height: 420 }
const GAP = 12

test('six slots: four corners plus left/right edge midpoints', () => {
  assert.deepEqual(
    [...SLOTS].sort(),
    ['bottom-left', 'bottom-right', 'left', 'right', 'top-left', 'top-right'].sort()
  )
})

test('top-left pins the top-left corner at the gap', () => {
  const r = placeAtSlot('top-left', size, wa)
  assert.deepEqual(r, { x: GAP, y: 25 + GAP, width: 340, height: 420 })
})

test('bottom-right pins the bottom-right corner at the gap', () => {
  const r = placeAtSlot('bottom-right', size, wa)
  assert.equal(r.x + r.width, wa.x + wa.width - GAP)
  assert.equal(r.y + r.height, wa.y + wa.height - GAP)
})

test('left midpoint pins the left edge and vertical centre', () => {
  const r = placeAtSlot('left', size, wa)
  assert.equal(r.x, GAP)
  assert.equal(r.y + r.height / 2, wa.y + wa.height / 2)
})

test('right midpoint pins the right edge and vertical centre', () => {
  const r = placeAtSlot('right', size, wa)
  assert.equal(r.x + r.width, wa.x + wa.width - GAP)
  assert.equal(r.y + r.height / 2, wa.y + wa.height / 2)
})

test('growth keeps the pinned corner fixed: bottom-right grows up-left', () => {
  const a = placeAtSlot('bottom-right', size, wa)
  const b = placeAtSlot('bottom-right', { width: 340, height: 600 }, wa)
  assert.equal(a.x + a.width, b.x + b.width)
  assert.equal(a.y + a.height, b.y + b.height)
  assert.equal(b.height, 600)
})

test('oversized panel is capped to the work area and stays inside', () => {
  const r = placeAtSlot('top-right', { width: 340, height: 5000 }, wa)
  assert.equal(r.height, 920 - 2 * GAP)
  assert.ok(r.y >= wa.y && r.y + r.height <= wa.y + wa.height)
})

test('work area offset (second display) is respected', () => {
  const wa2 = { x: -1920, y: -300, width: 1920, height: 1080 }
  const r = placeAtSlot('bottom-left', size, wa2)
  assert.equal(r.x, -1920 + GAP)
  assert.equal(r.y + r.height, -300 + 1080 - GAP)
})

test('nearestSlot classifies a drop near each corner and edge midpoint', () => {
  for (const slot of SLOTS) {
    const dropped = placeAtSlot(slot, size, wa)
    assert.equal(nearestSlot(dropped, wa), slot, `exact ${slot} position`)
    const nudged = { ...dropped, x: dropped.x + 40, y: dropped.y - 30 }
    assert.equal(nearestSlot(nudged, wa), slot, `nudged ${slot} position`)
  }
})

test('nearestSlot picks a midpoint over a corner for a mid-edge drop', () => {
  const dropped = { x: GAP, y: wa.y + wa.height / 2 - 180, ...size }
  assert.equal(nearestSlot(dropped, wa), 'left')
})

test('normalizeSlot accepts valid slots, falls back to bottom-right', () => {
  assert.equal(normalizeSlot('top-left'), 'top-left')
  assert.equal(normalizeSlot('centre'), 'bottom-right')
  assert.equal(normalizeSlot(undefined), 'bottom-right')
  assert.equal(normalizeSlot(42), 'bottom-right')
})

test('overlay.js places and sizes only through the slot helper', () => {
  const src = readFileSync(new URL('../src/main/overlay.js', import.meta.url), 'utf8')
  assert.match(src, /placeAtSlot\(/, 'placement must route through placeAtSlot (work-area cap)')
  assert.equal(
    (src.match(/win\.setContentSize\(/g) || []).length,
    1,
    'sizing happens exactly once, inside positionAtSlot — a bare setContentSize skips the cap'
  )
})
