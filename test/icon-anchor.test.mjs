import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconPosition, intersectRects, createIconFollower, ICON_SIZE } from '../src/main/icon-anchor.js'

const winFrame = { x: 0, y: 0, width: 1512, height: 945 }
const field = { x: 100, y: 100, width: 400, height: 200 }
// Events use the REAL helper protocol: flat x/y/width/height on the event
// itself plus a nested windowFrame rect (helper/ax-probe.swift
// emitFocus/emitBounds) — no evt.frame object.
const focus = (rect = field, over = {}) => ({
  type: 'focus',
  role: 'AXTextArea',
  subrole: '',
  bundleId: 'com.tinyspeck.slackmacgap',
  secure: false,
  elementId: '1',
  windowFrame: winFrame,
  ...rect,
  ...over
})
const bounds = (rect, over = {}) => ({ type: 'bounds', elementId: '1', windowFrame: winFrame, ...rect, ...over })

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
  const a = /** @type {any} */ (f.event(focus(), 0))
  assert.equal(a.type, 'place')
  assert.equal(a.x, 100 + 400 - 14 - ICON_SIZE)
})

test('secure field never shows the icon, by role or by flag (R2)', () => {
  const f = createIconFollower()
  assert.deepEqual(f.event(focus(field, { role: 'AXSecureTextField' }), 0), { type: 'hide' })
  // bounds for an unanchored element are ignored, not placed
  assert.equal(f.event(bounds(field), 100), null)
  assert.deepEqual(f.event(focus(field, { secure: true }), 200), { type: 'hide' })
  assert.equal(f.event(bounds(field), 300), null)
})

test('denylisted app and non-qualifying field hide (R1, R3)', () => {
  const f = createIconFollower()
  assert.deepEqual(f.event(focus(field, { bundleId: 'com.apple.Terminal' }), 0), { type: 'hide' })
  assert.deepEqual(f.event(focus(field, { role: 'AXButton' }), 0), { type: 'hide' })
  const searchBar = { x: 0, y: 0, width: 200, height: 24 } // under the min-size heuristic
  assert.deepEqual(f.event(focus(searchBar), 0), { type: 'hide' })
})

test('user denylist from settings is honored', () => {
  const f = createIconFollower({ settings: () => ({ denylist: ['com.tinyspeck.slackmacgap'] }) })
  assert.deepEqual(f.event(focus(), 0), { type: 'hide' })
})

test('motion hides the icon immediately; it reappears where the field settled', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  // a moving field never shows a chasing icon — hide on the first bounds
  assert.deepEqual(f.event(bounds({ ...field, x: 110 }), 100), { type: 'hide' })
  assert.deepEqual(f.event(bounds({ ...field, x: 120 }), 350), { type: 'hide' })
  assert.equal(f.tick(700), null) // 350ms since last move — not settled yet
  const settled = /** @type {any} */ (f.tick(750))
  assert.equal(settled.type, 'place')
  assert.equal(settled.x, 120 + 400 - 14 - ICON_SIZE) // final frame, not any mid-scroll one
  assert.equal(f.tick(1200), null) // shown once, nothing left pending
})

test('a continuous scroll at the helper poll cadence never flickers the icon back', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  // the helper polls the frame — settle must outlast the gap between polls
  // (settleMs 400 vs a 250ms cadence here; the real constants' ordering is
  // contract-tested in ax-probe.test.mjs)
  for (const t of [250, 500, 750, 1000]) {
    f.event(bounds({ ...field, y: 100 - t / 10 }), t)
    assert.equal(f.tick(t + 300), null, `icon must stay hidden mid-scroll at t=${t}`)
  }
  assert.equal(f.tick(1000 + 400).type, 'place')
})

test('a field that settles out of its window stays hidden (R4)', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  f.event(bounds({ ...field, y: -500 }), 100)
  assert.deepEqual(f.tick(600), { type: 'hide' })
})

test('an app switch hides instantly, before any focus resolves (axEnable)', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  assert.deepEqual(f.event({ type: 'axEnable', bundleId: 'com.apple.finder', method: 'none' }, 50), {
    type: 'hide'
  })
  assert.equal(f.event(bounds(field), 100), null) // no longer anchored
  assert.equal(f.tick(1000), null) // and nothing pending resurrects it
})

test('blur mid-motion cancels the pending reappearance', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  f.event(bounds({ ...field, x: 110 }), 10)
  assert.deepEqual(f.event({ type: 'blur' }, 20), { type: 'hide' })
  assert.equal(f.tick(1000), null)
  assert.equal(f.event(bounds(field), 1100), null) // no longer anchored
})

test('a fresh focus mid-motion places immediately and drops the stale pending frame', () => {
  const f = createIconFollower({ settleMs: 400 })
  f.event(focus(), 0)
  f.event(bounds({ ...field, x: 110 }), 10)
  const a = /** @type {any} */ (f.event(focus({ ...field, x: 300 }), 15))
  assert.equal(a.type, 'place')
  assert.equal(a.x, 300 + 400 - 14 - ICON_SIZE)
  assert.equal(f.tick(1000), null) // the old element's motion never resurfaces
})

test('events from our own process never anchor (self-filter)', () => {
  const f = createIconFollower({ selfPid: 42 })
  assert.equal(f.event(focus(field, { pid: 42 }), 0), null) // our own composer
  const a = /** @type {any} */ (f.event(focus(field, { pid: 43 }), 0))
  assert.equal(a.type, 'place') // everyone else still anchors
})

test('the follower owns the settle clock: settleMs and hasPending are exposed', () => {
  // The wiring schedules its flush from these instead of re-deriving the
  // deadline from a copied constant — two clocks for one policy diverge
  // silently into a permanently hidden icon.
  const f = createIconFollower({ settleMs: 123 })
  assert.equal(f.settleMs, 123)
  assert.equal(f.hasPending(), false)
  f.event(focus(), 0)
  assert.equal(f.hasPending(), false) // focus places immediately, nothing pending
  f.event(bounds({ ...field, x: 110 }), 10)
  assert.equal(f.hasPending(), true) // motion awaiting settle — wiring must re-arm
  f.tick(500)
  assert.equal(f.hasPending(), false) // flushed
  f.event(bounds({ ...field, x: 120 }), 600)
  f.event({ type: 'blur' }, 610)
  assert.equal(f.hasPending(), false) // blur cancels the pending show
})

test('unknown or malformed events are ignored', () => {
  const f = createIconFollower()
  assert.equal(f.event({ type: 'heartbeat' }, 0), null)
  assert.equal(f.event(null, 0), null)
  assert.equal(f.event('focus', 0), null)
})

