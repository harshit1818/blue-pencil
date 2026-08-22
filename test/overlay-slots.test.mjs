import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SLOTS, placeAtSlot, placeNearRect, nearestSlot, normalizeSlot } from '../src/main/overlay-slots.js'

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

const icon = { x: 800, y: 500, width: 38, height: 38 }

test('field anchor unfolds up-left: right edges aligned, bottom a gap above the icon', () => {
  const r = placeNearRect(icon, size, wa)
  assert.equal(r.x + r.width, icon.x + icon.width)
  assert.equal(r.y + r.height, icon.y - GAP)
  assert.deepEqual({ width: r.width, height: r.height }, size)
})

test('no room above the icon → panel flips below it', () => {
  const high = { ...icon, y: wa.y + 20 }
  const r = placeNearRect(high, size, wa)
  assert.equal(r.y, high.y + high.height + GAP)
  assert.ok(r.y + r.height <= wa.y + wa.height - GAP)
})

test('icon near the left edge → panel flips to left-align with the icon', () => {
  const left = { ...icon, x: wa.x + 40 }
  const r = placeNearRect(left, size, wa)
  assert.equal(r.x, left.x)
})

test('anchored panel stays fully inside the work area at every screen edge', () => {
  const spots = [
    { x: wa.x, y: wa.y },
    { x: wa.x + wa.width - 38, y: wa.y },
    { x: wa.x, y: wa.y + wa.height - 38 },
    { x: wa.x + wa.width - 38, y: wa.y + wa.height - 38 },
    { x: 700, y: 500 }
  ]
  for (const s of spots) {
    const r = placeNearRect({ ...s, width: 38, height: 38 }, size, wa)
    const where = `${s.x},${s.y}`
    assert.ok(r.x >= wa.x && r.x + r.width <= wa.x + wa.width, `x inside for ${where}`)
    assert.ok(r.y >= wa.y && r.y + r.height <= wa.y + wa.height, `y inside for ${where}`)
  }
})

test('oversized anchored panel is capped to the work area', () => {
  const r = placeNearRect(icon, { width: 340, height: 5000 }, wa)
  assert.equal(r.height, 920 - 2 * GAP)
  assert.ok(r.y >= wa.y && r.y + r.height <= wa.y + wa.height)
})

test('anchored placement respects a second display work area', () => {
  const wa2 = { x: -1920, y: -300, width: 1920, height: 1080 }
  const r = placeNearRect({ x: -1000, y: 400, width: 38, height: 38 }, size, wa2)
  assert.equal(r.x + r.width, -1000 + 38)
  assert.equal(r.y + r.height, 400 - GAP)
})

test('overlay.js places and sizes only through the slot helpers', () => {
  const src = readFileSync(new URL('../src/main/overlay.js', import.meta.url), 'utf8')
  assert.match(src, /placeAtSlot\(/, 'placement must route through placeAtSlot (work-area cap)')
  assert.match(src, /placeNearRect\(/, 'the field-anchored path must route through placeNearRect')
  // An anchored rect is not a slot rect, so snapToNearestSlot neither no-ops nor
  // stays put: it would yank the unfolded panel to a corner and overwrite the
  // remembered slot. The snap must stay behind a fieldAnchor guard.
  assert.match(
    src,
    /if \(fieldAnchor\) return[\s\S]{0,200}?snapToNearestSlot\(/,
    'the drag-snap must be skipped while the panel is field-anchored'
  )
  assert.equal(
    (src.match(/win\.setContentSize\(/g) || []).length,
    1,
    'sizing happens exactly once, inside positionAtSlot — a bare setContentSize skips the cap'
  )
})
