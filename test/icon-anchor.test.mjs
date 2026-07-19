import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconPosition, intersectRects, createIconFollower, ICON_SIZE } from '../src/main/icon-anchor.js'

const winFrame = { x: 0, y: 0, width: 1512, height: 945 }
const field = { x: 100, y: 100, width: 400, height: 200 }
const focus = (over = {}) => ({
  type: 'focus',
  role: 'AXTextArea',
  bundleId: 'com.tinyspeck.slackmacgap',
  frame: field,
  windowFrame: winFrame,
  ...over
})
const bounds = (frame, over = {}) => ({ type: 'bounds', frame, windowFrame: winFrame, ...over })

// --- geometry ---

test('icon sits inside bottom-right of a fully visible field, badge insets', () => {
  const p = iconPosition(field, winFrame)
  // right inset 14, bottom inset 16 — matches the in-app badge (App.jsx)
  assert.deepEqual(p, { x: 100 + 400 - 14 - ICON_SIZE, y: 100 + 200 - 16 - ICON_SIZE })
})

test('tall field clipped by the window bottom anchors to the visible bottom', () => {
  const tall = { x: 100, y: 100, width: 400, height: 5000 }
  const p = iconPosition(tall, winFrame)
  assert.equal(p.y, 945 - 16 - ICON_SIZE) // window bottom, not the field's true bottom
  assert.ok(p.y + ICON_SIZE <= 945, 'icon floats past the visible portion')
})

test('field scrolled fully out of its window yields no position', () => {
  const scrolledOut = { x: 100, y: -500, width: 400, height: 200 }
  assert.equal(iconPosition(scrolledOut, winFrame), null)
  assert.equal(intersectRects(scrolledOut, winFrame), null)
})

test('visible sliver too small to host the icon yields no position', () => {
  const sliver = { x: 100, y: -190, width: 400, height: 200 } // 10px visible
  assert.equal(iconPosition(sliver, winFrame), null)
})

test('shallow visible portion clamps the icon inside it, never above/left', () => {
  const shallow = { x: 100, y: -155, width: 400, height: 200 } // 45px visible
  const p = iconPosition(shallow, winFrame)
  assert.equal(p.y, 0) // clamped to the visible top, not 45-16-38 < 0
})

test('missing window frame falls back to the element frame alone', () => {
  const p = iconPosition(field, null)
  assert.deepEqual(p, { x: 100 + 400 - 14 - ICON_SIZE, y: 100 + 200 - 16 - ICON_SIZE })
})

test('garbage frames yield no position', () => {
  assert.equal(iconPosition(null, winFrame), null)
  assert.equal(iconPosition({ x: NaN, y: 0, width: 100, height: 100 }, winFrame), null)
  assert.equal(iconPosition({ x: 0, y: 0, width: 0, height: 0 }, winFrame), null)
})

// --- follow state (F2 events through the F3 filter) ---

test('qualifying focus places the icon immediately', () => {
  const f = createIconFollower()
  const a = f.event(focus(), 0)
  assert.equal(a.type, 'place')
  assert.equal(a.x, 100 + 400 - 14 - ICON_SIZE)
})

test('secure field never shows the icon, by role or by flag (R2)', () => {
  const f = createIconFollower()
  assert.deepEqual(f.event(focus({ role: 'AXSecureTextField' }), 0), { type: 'hide' })
  // bounds for an unanchored element are ignored, not placed
  assert.equal(f.event(bounds(field), 100), null)
  assert.deepEqual(f.event(focus({ secure: true }), 200), { type: 'hide' })
  assert.equal(f.event(bounds(field), 300), null)
})

test('denylisted app and non-qualifying field hide (R1, R3)', () => {
  const f = createIconFollower()
  assert.deepEqual(f.event(focus({ bundleId: 'com.apple.Terminal' }), 0), { type: 'hide' })
  assert.deepEqual(f.event(focus({ role: 'AXButton' }), 0), { type: 'hide' })
  const searchBar = { x: 0, y: 0, width: 200, height: 24 } // under the min-size heuristic
  assert.deepEqual(f.event(focus({ frame: searchBar }), 0), { type: 'hide' })
})

test('user denylist from settings is honored', () => {
  const f = createIconFollower({ settings: () => ({ denylist: ['com.tinyspeck.slackmacgap'] }) })
  assert.deepEqual(f.event(focus(), 0), { type: 'hide' })
})

test('bounds bursts are throttled with a trailing move carrying the latest frame (R4)', () => {
  const f = createIconFollower({ throttleMs: 40 })
  f.event(focus(), 0)
  const mid = { ...field, x: 110 }
  const last = { ...field, x: 120 }
  assert.equal(f.event(bounds(mid), 10), null) // inside the window — deferred
  assert.equal(f.event(bounds(last), 20), null)
  assert.equal(f.tick(30), null) // window not yet elapsed
  const trailing = f.tick(45)
  assert.equal(trailing.type, 'place')
  assert.equal(trailing.x, 120 + 400 - 14 - ICON_SIZE) // latest frame wins
  // next event after the window passes through immediately (leading edge)
  const a = f.event(bounds({ ...field, x: 130 }), 200)
  assert.equal(a.type, 'place')
  assert.equal(f.tick(300), null) // nothing left pending
})

test('bounds scrolling the field out of view hides the icon', () => {
  const f = createIconFollower({ throttleMs: 40 })
  f.event(focus(), 0)
  const a = f.event(bounds({ ...field, y: -500 }), 100)
  assert.deepEqual(a, { type: 'hide' })
})

test('blur hides immediately, even mid-throttle, and drops the pending move', () => {
  const f = createIconFollower({ throttleMs: 40 })
  f.event(focus(), 0)
  assert.equal(f.event(bounds({ ...field, x: 110 }), 10), null)
  assert.deepEqual(f.event({ type: 'blur' }, 20), { type: 'hide' })
  assert.equal(f.tick(100), null) // pending move must not resurrect the icon
  assert.equal(f.event(bounds(field), 200), null) // no longer anchored
})

test('a fresh focus is never throttled by the previous element’s churn', () => {
  const f = createIconFollower({ throttleMs: 40 })
  f.event(focus(), 0)
  f.event(bounds({ ...field, x: 110 }), 10)
  const a = f.event(focus({ frame: { ...field, x: 300 } }), 15)
  assert.equal(a.type, 'place')
  assert.equal(a.x, 300 + 400 - 14 - ICON_SIZE)
})

test('unknown or malformed events are ignored', () => {
  const f = createIconFollower()
  assert.equal(f.event({ type: 'heartbeat' }, 0), null)
  assert.equal(f.event(null, 0), null)
  assert.equal(f.event('focus', 0), null)
})
