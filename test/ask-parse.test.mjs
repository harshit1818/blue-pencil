import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ask-parse.mjs')
// run(payload, botId, ...options) -> resolved answer on stdout
const run = (payload, ...args) =>
  execFileSync('node', [script, ...args], { input: JSON.stringify(payload), encoding: 'utf8' })

const q = { user: 'BOT', text: 'question?' } // the parent (our own question)

test('numeric reply picks the matching 1-based option', () => {
  const p = { ok: true, messages: [q, { user: 'U', text: '2' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), 'no')
})

test('no human reply yet -> empty (keep polling)', () => {
  assert.equal(run({ ok: true, messages: [q] }, 'BOT', 'yes', 'no'), '')
})

test('free-form reply passes through', () => {
  const p = { ok: true, messages: [q, { user: 'U', text: 'skip it for now' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), 'skip it for now')
})

test('latest human reply wins over an earlier one', () => {
  const p = { ok: true, messages: [q, { user: 'U', text: '1' }, { user: 'U', text: '2' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), 'no')
})

test("our own in-thread posts (ack/timeout) are ignored", () => {
  const p = { ok: true, messages: [q, { user: 'BOT', text: 'still waiting', bot_id: 'B1' }, { user: 'U', text: 'yes' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), 'yes')
})

test('option match is case-insensitive', () => {
  const p = { ok: true, messages: [q, { user: 'U', text: 'YES' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), 'yes')
})

test('out-of-range number is treated as free text, not an option', () => {
  const p = { ok: true, messages: [q, { user: 'U', text: '9' }] }
  assert.equal(run(p, 'BOT', 'yes', 'no'), '9')
})

test('missing/garbage messages -> empty', () => {
  assert.equal(run({ ok: false }, 'BOT', 'yes', 'no'), '')
})
