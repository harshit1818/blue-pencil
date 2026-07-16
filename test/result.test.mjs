import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from '../src/main/transform.js'
import { panelResult, clearPanel } from '../src/renderer/src/result.js'

// #16: App's reTone built the result inline and dropped the markdown flag,
// diverging from HotkeyPopover. Both now build it through panelResult.

test('tone result keeps markdown:true through panelResult', async () => {
  const res = await transform(
    { text: '**hi** there', action: 'tone', tone: 'Friendly', markdown: true },
    async () => 'rewritten'
  )
  assert.deepEqual(panelResult(res), { title: 'Friendly tone', text: 'rewritten', markdown: true })
})

test('plain tone result stays markdown:false', async () => {
  const res = await transform({ text: 'hi', action: 'tone', tone: 'Casual' }, async () => 'out')
  assert.deepEqual(panelResult(res), { title: 'Casual tone', text: 'out', markdown: false })
})

// #21: the overlay's settings subscriber only relabeled the provider — a result
// from the previous provider stayed deliverable. Both hosts now invalidate
// through clearPanel on provider change.

test('provider switch drops every stale transient, including the overlay hint', () => {
  const calls = {}
  const set = Object.fromEntries(
    ['result', 'marks', 'error', 'copied', 'hint'].map((k) => [k, (v) => (calls[k] = v)])
  )
  clearPanel(set)
  assert.deepEqual(calls, { result: null, marks: null, error: null, copied: false, hint: null })
})

test('a host without the overlay-only hint setter still clears the rest', () => {
  const calls = {}
  const set = Object.fromEntries(
    ['result', 'marks', 'error', 'copied'].map((k) => [k, (v) => (calls[k] = v)])
  )
  clearPanel(set)
  assert.deepEqual(calls, { result: null, marks: null, error: null, copied: false })
})
