import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validBounds } from '../src/main/window-bounds.js'

const laptop = [{ workArea: { x: 0, y: 25, width: 1512, height: 920 } }]
const external = [
  ...laptop,
  { workArea: { x: -1920, y: -300, width: 1920, height: 1080 } }
]

test('bounds fully on the primary display pass through', () => {
  const saved = { x: 100, y: 100, width: 820, height: 660 }
  assert.equal(validBounds(saved, laptop), saved)
})

test('bounds saved on an undocked external display are rejected', () => {
  const saved = { x: -1500, y: -200, width: 820, height: 660 }
  assert.equal(validBounds(saved, external), saved)
  assert.equal(validBounds(saved, laptop), null)
})

test('fully off-screen coordinates are rejected (the #11 repro)', () => {
  assert.equal(validBounds({ x: -5000, y: -5000, width: 820, height: 660 }, laptop), null)
})

test('a sliver of overlap too small to grab is rejected', () => {
  // 10px of the right edge on screen — title bar unreachable
  assert.equal(validBounds({ x: -810, y: 100, width: 820, height: 660 }, laptop), null)
})

test('partial but grabbable overlap is kept', () => {
  assert.equal(
    validBounds({ x: -400, y: 100, width: 820, height: 660 }, laptop)?.x,
    -400
  )
})

test('null and malformed JSON shapes are rejected', () => {
  assert.equal(validBounds(null, laptop), null)
  assert.equal(validBounds({}, laptop), null)
  assert.equal(validBounds({ x: '10', y: 10, width: 820, height: 660 }, laptop), null)
  assert.equal(validBounds({ x: NaN, y: 10, width: 820, height: 660 }, laptop), null)
})
