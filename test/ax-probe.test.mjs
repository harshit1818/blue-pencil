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

const PROTOCOL = ['focus', 'bounds', 'blur', 'heartbeat', 'readValue', 'verifyFocus', 'error', 'axEnable']

test('probe emits exactly the protocol event types', () => {
  const emitted = new Set([...src.matchAll(/"type":\s*"(\w+)"/g)].map((m) => m[1]))
  assert.deepEqual([...emitted].sort(), [...PROTOCOL].sort())
})

test('focus payload carries every key qualifies() and the consumers need', () => {
  const start = src.indexOf('"type": "focus"')
  assert.ok(start > -1)
  const payload = src.slice(start, src.indexOf('])', start))
  for (const key of ['bundleId', 'role', 'subrole', 'secure', 'x', 'y', 'width', 'height', 'elementId', 'windowFrame']) {
    assert.ok(payload.includes(`"${key}":`), `focus payload missing "${key}"`)
  }
})

test('bounds payload carries the owning window frame (R4 visible-portion clamp)', () => {
  const start = src.indexOf('"type": "bounds"')
  assert.ok(start > -1)
  const payload = src.slice(start, src.indexOf('])', start))
  assert.ok(payload.includes('"windowFrame":'), 'bounds payload missing "windowFrame"')
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

test('no other route to an AXValue read exists in the source', () => {
  // Tripwire against bypasses the count above misses: building the attribute
  // name at runtime, or calling the raw AX API outside copyAttr.
  assert.ok(!src.includes('"AXValue"'), 'AXValue attribute must not be built from a string literal')
  assert.equal(src.split('AXUIElementCopyAttributeValue').length, 2, 'raw attribute reads only inside copyAttr')
  const calls = [...src.matchAll(/(?<!func )\b(?:copyAttr|stringAttr|elementAttr)\([^,]+,\s*([^)]+)\)/g)]
  assert.ok(calls.length > 0)
  for (const [call, attrArg] of calls) {
    assert.ok(attrArg === 'attr' || attrArg.startsWith('kAX'), `non-constant attribute arg in: ${call}`)
  }
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

test('electron AX tree is woken before the first focus read', () => {
  // Chromium builds its AX tree lazily: Electron listens for
  // AXManualAccessibility, vanilla Chromium for AXEnhancedUserInterface.
  // Without this poke the probe sees nothing inside Slack/Chrome/ChatGPT.
  const fnStart = src.indexOf('func enableAXTree(')
  assert.ok(fnStart > -1, 'enableAXTree() not found')
  const body = src.slice(fnStart, src.indexOf('\nfunc ', fnStart))
  const manualAt = body.indexOf('"AXManualAccessibility"')
  const enhancedAt = body.indexOf('"AXEnhancedUserInterface"')
  assert.ok(manualAt > -1 && enhancedAt > manualAt, 'must try AXManualAccessibility first, AXEnhancedUserInterface as fallback')
  assert.equal(body.split('AXUIElementSetAttributeValue').length, 3, 'each attribute set exactly once')
  assert.equal(body.split('kCFBooleanTrue').length, 3, 'both attributes must be set to true')

  const obsStart = src.indexOf('func observe(')
  const obsBody = src.slice(obsStart, src.indexOf('\n// ', obsStart))
  const enableAt = obsBody.indexOf('enableAXTree(')
  const refreshAt = obsBody.indexOf('refreshFocus()')
  assert.ok(enableAt > -1 && refreshAt > enableAt, 'observe() must enable the AX tree before refreshFocus()')
  assert.ok(obsBody.includes('"type": "axEnable"'), 'observe() must emit the axEnable outcome for the truth-table run')
})

test('swift source typechecks', (t) => {
  const find = spawnSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' })
  if (find.status !== 0) return t.skip('no swift toolchain on this machine')
  const check = spawnSync('xcrun', ['swiftc', '-typecheck', swiftPath], { encoding: 'utf8', timeout: 180000 })
  assert.equal(check.status, 0, `swiftc -typecheck failed:\n${check.stderr}`)
})
