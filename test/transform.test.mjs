import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from '../src/main/transform.js'

// Injected in place of the real provider call — records every prompt.
const mock = (reply = 'REPLY') => {
  const calls = []
  const call = async (prompt) => {
    calls.push(prompt)
    return reply
  }
  return { calls, call }
}

test('empty input throws before any model call', async () => {
  const { calls, call } = mock()
  await assert.rejects(transform({ text: '   ', action: 'improve' }, call), /Nothing to transform/)
  await assert.rejects(transform(undefined, call), /Nothing to transform/)
  assert.equal(calls.length, 0)
})

test('unknown action throws', async () => {
  const { call } = mock()
  await assert.rejects(transform({ text: 'hi', action: 'explode' }, call), /Unknown action: explode/)
})

test('proofread sends the copy-editor JSON prompt and parses the reply', async () => {
  const { calls, call } = mock(
    '{"corrected":"Fixed.","changes":[{"before":"a","after":"b","reason":"typo"}]}'
  )
  const res = await transform({ text: 'a text', action: 'proofread' }, call)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /copy editor/)
  assert.match(calls[0], /"corrected":string/)
  assert.match(calls[0], /a text/)
  assert.deepEqual(res, {
    kind: 'proofread',
    title: 'Proofread',
    text: 'Fixed.',
    changes: [{ before: 'a', after: 'b', reason: 'typo' }],
    markdown: false
  })
})

test('proofread falls back to a plain rewrite when the reply is not JSON', async () => {
  const { call } = mock('Just the corrected text, no JSON.')
  const res = await transform({ text: 'a text', action: 'proofread' }, call)
  assert.equal(res.kind, 'rewrite')
  assert.equal(res.title, 'Proofread')
  assert.equal(res.text, 'Just the corrected text, no JSON.')
})

test('format sends the structure instruction and always returns markdown:true', async () => {
  const { calls, call } = mock('## out')
  const res = await transform({ text: 'plain', action: 'format', markdown: false }, call)
  assert.match(calls[0], /Add Markdown structure/)
  assert.match(calls[0], /plain/)
  assert.deepEqual(res, { kind: 'rewrite', title: 'Format', text: '## out', markdown: true })
})

test('tone requires a tone and titles the result with it', async () => {
  const { calls, call } = mock('out')
  await assert.rejects(transform({ text: 'hi', action: 'tone' }, call), /No tone specified/)
  assert.equal(calls.length, 0)
  const res = await transform({ text: 'hi', action: 'tone', tone: 'Friendly' }, call)
  assert.match(calls[0], /in a friendly tone/)
  assert.equal(res.title, 'Friendly tone')
  assert.equal(res.kind, 'rewrite')
})

const REWRITE_HINTS = {
  improve: /improve clarity/,
  simplify: /easy to read/,
  summarize: /Summarize concisely/,
  paraphrase: /different phrasing/,
  neutralize: /promotional language/,
  formalize: /formal register/,
  coherence: /logical flow/
}

for (const [action, hint] of Object.entries(REWRITE_HINTS)) {
  test(`${action} routes to its rewrite instruction`, async () => {
    const { calls, call } = mock('out')
    const res = await transform({ text: 'the input', action }, call)
    assert.equal(calls.length, 1)
    assert.match(calls[0], hint)
    assert.match(calls[0], /the input/)
    assert.equal(res.kind, 'rewrite')
    assert.equal(res.title.toLowerCase(), action)
    assert.equal(res.markdown, false)
  })
}

test('markdown input adds the preserve clause and carries the flag through', async () => {
  const { calls, call } = mock('out')
  const res = await transform({ text: 'hi', action: 'improve', markdown: true }, call)
  assert.match(calls[0], /preserve all of its formatting/)
  assert.equal(res.markdown, true)
})
