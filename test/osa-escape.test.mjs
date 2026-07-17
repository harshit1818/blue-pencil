import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeOsaString } from '../src/main/osa-escape.js'

test('escapes backslashes before quotes', () => {
  assert.equal(escapeOsaString('evil\\'), 'evil\\\\')
  assert.equal(escapeOsaString('say "hi"'), 'say \\"hi\\"')
  assert.equal(escapeOsaString('back\\slash "and" quote'), 'back\\\\slash \\"and\\" quote')
  assert.equal(escapeOsaString('plain app'), 'plain app')
})

test('a trailing backslash cannot consume the closing quote (#40 repro)', () => {
  const script = `set frontmost of process "${escapeOsaString('evil\\')}" to true`
  // Old single-char escape emitted ...process "evil\" to true — string never closed.
  assert.equal(script, 'set frontmost of process "evil\\\\" to true')
})

test('coerces non-strings like the old inline escape did', () => {
  assert.equal(escapeOsaString(null), 'null')
  assert.equal(escapeOsaString(42), '42')
})
