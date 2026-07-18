// Contract tests for helper/ax-probe.swift (#53, M0). The probe runs against
// live macOS apps — its behaviour there is the truth table's job (HITL, F1b).
// What IS machine-verifiable: the source compiles, its emitted protocol matches
// what the JS side consumes, and the secure-field invariant holds structurally
// (single guarded AXValue read). Break any of those and these go red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createNdjsonParser } from '../src/main/ndjson.js'
import { qualifies, SECURE_ROLES } from '../src/main/field-qualify.js'

const swiftPath = fileURLToPath(new URL('../helper/ax-probe.swift', import.meta.url))
const src = readFileSync(swiftPath, 'utf8')

const PROTOCOL = ['focus', 'bounds', 'blur', 'heartbeat', 'readValue', 'verifyFocus', 'error']

test('probe emits exactly the protocol event types', () => {
  const emitted = new Set([...src.matchAll(/"type":\s*"(\w+)"/g)].map((m) => m[1]))
  assert.deepEqual([...emitted].sort(), [...PROTOCOL].sort())
})

test('focus payload carries every key qualifies() and the consumers need', () => {
  const start = src.indexOf('"type": "focus"')
  assert.ok(start > -1)
  const payload = src.slice(start, src.indexOf('])', start))
  for (const key of ['bundleId', 'role', 'subrole', 'secure', 'x', 'y', 'width', 'height', 'elementId']) {
    assert.ok(payload.includes(`"${key}":`), `focus payload missing "${key}"`)
  }
})

test('secure roles mirror field-qualify SECURE_ROLES', () => {
  const m = src.match(/let secureRoles = \[([^\]]*)\]/)
  assert.ok(m, 'secureRoles literal not found')
  const swiftRoles = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  assert.deepEqual(swiftRoles.sort(), [...SECURE_ROLES].sort())
})

test('the single AXValue read sits behind the isSecure guard in readValue()', () => {
  assert.equal(src.split('kAXValueAttribute').length, 2, 'AXValue must be read in exactly one place')
  const fnStart = src.indexOf('func readValue(')
  assert.ok(fnStart > -1)
  const fnEnd = src.indexOf('\nfunc ', fnStart)
  const body = src.slice(fnStart, fnEnd)
  const guardAt = body.indexOf('if isSecure(')
  const readAt = body.indexOf('kAXValueAttribute')
  assert.ok(guardAt > -1 && readAt > guardAt, 'isSecure guard must precede the AXValue read')
  assert.match(body.slice(guardAt, readAt), /return emit\(/, 'secure branch must return before the read')
})

test('emitted event shapes flow through the parser into qualifies()', () => {
  const p = createNdjsonParser()
  const focus =
    '{"type":"focus","bundleId":"com.tinyspeck.slackmacgap","pid":42,"role":"AXTextArea","subrole":"",' +
    '"secure":false,"x":100,"y":200,"width":600,"height":120,"elementId":"9137","ts":1}\n'
  const secure = focus.replace('"secure":false', '"secure":true').replace('AXTextArea', 'AXSecureTextField')
  const events = [...p.push(focus.slice(0, 40)), ...p.push(focus.slice(40) + secure)]
  assert.equal(events.length, 2)
  assert.equal(qualifies(events[0]), true)
  assert.equal(qualifies(events[1]), false)
})

test('swift source typechecks', (t) => {
  const find = spawnSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' })
  if (find.status !== 0) return t.skip('no swift toolchain on this machine')
  const check = spawnSync('xcrun', ['swiftc', '-typecheck', swiftPath], { encoding: 'utf8', timeout: 180000 })
  assert.equal(check.status, 0, `swiftc -typecheck failed:\n${check.stderr}`)
})
