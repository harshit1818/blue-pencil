import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGesture } from '../src/main/icon-gesture.js'

// Screen coords: mouse at (100,100), window origin at (90,95) → offset (-10,-5).
const down = { type: 'down', x: 100, y: 100, winX: 90, winY: 95 }

test('down then up without movement is a click', () => {
  const g = createGesture()
  assert.equal(g.feed(down), null)
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'click' })
})

test('jitter under the threshold still counts as a click', () => {
  const g = createGesture()
  g.feed(down)
  assert.equal(g.feed({ type: 'move', x: 102, y: 101 }), null)
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'click' })
})

test('movement past the threshold starts a drag preserving the grab offset', () => {
  const g = createGesture()
  g.feed(down)
  assert.deepEqual(g.feed({ type: 'move', x: 110, y: 100 }), { type: 'moveTo', x: 100, y: 95 })
})

test('further moves keep tracking with the same offset', () => {
  const g = createGesture()
  g.feed(down)
  g.feed({ type: 'move', x: 110, y: 100 })
  assert.deepEqual(g.feed({ type: 'move', x: 50, y: 200 }), { type: 'moveTo', x: 40, y: 195 })
})

test('once dragging, jitter back near the start still drags (no click)', () => {
  const g = createGesture()
  g.feed(down)
  g.feed({ type: 'move', x: 110, y: 100 })
  assert.deepEqual(g.feed({ type: 'move', x: 101, y: 100 }), { type: 'moveTo', x: 91, y: 95 })
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'dragEnd' })
})

test('up after a drag is dragEnd, never click', () => {
  const g = createGesture()
  g.feed(down)
  g.feed({ type: 'move', x: 200, y: 200 })
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'dragEnd' })
})

test('move or up without a down is ignored', () => {
  const g = createGesture()
  assert.equal(g.feed({ type: 'move', x: 5, y: 5 }), null)
  assert.equal(g.feed({ type: 'up' }), null)
})

test('the machine resets after each gesture', () => {
  const g = createGesture()
  g.feed(down)
  g.feed({ type: 'move', x: 200, y: 200 })
  g.feed({ type: 'up' })
  g.feed(down)
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'click' })
})

test('custom threshold is honored', () => {
  const g = createGesture({ threshold: 20 })
  g.feed(down)
  assert.equal(g.feed({ type: 'move', x: 110, y: 100 }), null)
  assert.deepEqual(g.feed({ type: 'up' }), { type: 'click' })
})
