import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from '../src/main/transform.js'
import { panelResult } from '../src/renderer/src/result.js'

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
