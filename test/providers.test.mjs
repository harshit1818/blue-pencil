import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noKey, normalizeError } from '../src/main/provider-errors.js'

test('noKey names the provider and sets code NO_KEY', () => {
  const err = noKey('Anthropic')
  assert.ok(err instanceof Error)
  assert.equal(err.code, 'NO_KEY')
  assert.match(err.message, /No API key set for Anthropic/)
  assert.match(err.message, /Add the key/)
})

const sdkError = (status) => Object.assign(new Error('raw sdk noise'), { status })

test('401/403 map to a bad-key message', () => {
  for (const status of [401, 403]) {
    const err = normalizeError(sdkError(status), 'OpenAI', 'gpt-4.1')
    assert.match(err.message, /OpenAI rejected the key/)
    assert.doesNotMatch(err.message, /raw sdk noise/)
  }
})

test('429 maps to a rate-limit message', () => {
  const err = normalizeError(sdkError(429), 'Groq', 'llama')
  assert.match(err.message, /Groq is rate-limiting/)
})

test('404 names the unrecognised model', () => {
  const err = normalizeError(sdkError(404), 'Gemini', 'gemini-9000')
  assert.match(err.message, /Gemini didn’t recognise the model/)
  assert.match(err.message, /gemini-9000/)
})

test('5xx maps to a server-error message', () => {
  for (const status of [500, 503]) {
    const err = normalizeError(sdkError(status), 'Anthropic', 'claude')
    assert.match(err.message, /Anthropic had a server error/)
  }
})

test('errors without a known status pass through untouched', () => {
  const raw = new Error('ECONNREFUSED')
  assert.equal(normalizeError(raw, 'OpenAI', 'gpt-4.1'), raw)
})

test('non-Error throws are wrapped in an Error', () => {
  const err = normalizeError('string throw', 'OpenAI', 'gpt-4.1')
  assert.ok(err instanceof Error)
  assert.equal(err.message, 'string throw')
})
