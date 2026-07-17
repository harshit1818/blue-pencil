import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// #27: the API key input, model id input and main textarea must have real
// accessible names — placeholder-as-label stops being announced once a value
// exists. Asserted statically on the source, same pattern as aria-live.test.mjs.

const src = readFileSync(new URL('../src/renderer/src/App.jsx', import.meta.url), 'utf8')

test('API key password input carries an aria-label', () => {
  const input = src.slice(src.indexOf('type="password"'))
  const end = input.indexOf('/>')
  assert.match(input.slice(0, end), /aria-label=/, 'password input has no aria-label')
})

test('model id input is associated with the visible Model label', () => {
  assert.match(src, /<label htmlFor="model-id"/, 'Model span is not a <label htmlFor>')
  const input = src.slice(src.indexOf('id="model-id"'))
  assert.match(input.slice(0, input.indexOf('/>')), /placeholder="model id"/)
})

test('writing textarea carries an aria-label', () => {
  const ta = src.slice(src.indexOf('<textarea'))
  assert.match(ta.slice(0, ta.indexOf('/>')), /aria-label=/, 'textarea has no aria-label')
})
