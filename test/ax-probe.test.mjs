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
  assert.ok(body.includes('kCFBooleanTrue'), 'attributes must be set to true')

  const obsStart = src.indexOf('func observe(')
  const obsBody = src.slice(obsStart, src.indexOf('\n// ', obsStart))
  const enableAt = obsBody.indexOf('enableAXTree(')
  const refreshAt = obsBody.indexOf('refreshFocus()')
  assert.ok(enableAt > -1 && refreshAt > enableAt, 'observe() must enable the AX tree before refreshFocus()')
  assert.ok(obsBody.includes('"type": "axEnable"'), 'observe() must emit the axEnable outcome for the truth-table run')
})

test('a sub-second frame poll emits bounds for scroll moves AX never notifies', () => {
  // In-page scrolling relocates the focused element without any AX moved/
  // resized notification — only a poll catches it. Break the poll (remove it,
  // slow it past 1s, stop emitting) and this goes red.
  const m = src.match(/withTimeInterval:\s*(0\.\d+),\s*repeats:\s*true[\s\S]*?lastPolledFrame[\s\S]*?emitBounds\(/)
  assert.ok(m, 'frame-poll timer comparing lastPolledFrame and emitting bounds not found')
  assert.ok(Number(m[1]) < 1, 'poll must be sub-second to feel attached while scrolling')
})

test('the AX poke is denylist-gated, ownership-aware, and reverted on exit', () => {
  // The poke flips screen-reader detection in Chromium apps: never apply it to
  // apps the consumer denylists (passed as argv), never claim an attribute
  // another AX client already set, and always revert what WE set — on both
  // exit paths (stdin close and the driver's SIGTERM kill) — so the side
  // effect can't outlive Blue Pencil.
  assert.match(src, /deniedBundles[\s\S]{0,80}CommandLine\.arguments/, 'argv denylist not parsed')
  assert.match(src, /deniedBundles\.contains\(currentBundleId\)/, 'poke not gated on the denylist')
  assert.match(src, /"already"/, 'an attribute already set by another client must be left alone')
  const revert = src.match(/func revertPokes\(\)[\s\S]*?kCFBooleanFalse/)
  assert.ok(revert, 'revertPokes() must set the poked attribute back to false')
  const calls = src.split('revertPokes()').length - 1
  assert.ok(calls >= 3, 'revertPokes must run on both exit paths (definition + stdin close + SIGTERM)')
})

test('AX calls are time-bounded below the heartbeat budget (hung-app safety)', () => {
  // Without a messaging timeout, one beachballing app blocks the run loop,
  // starves heartbeats past the driver's 6s budget, and burns the respawn
  // budget on a healthy helper. The bound must leave room for a poll+emit
  // chain of a few calls inside one 3s heartbeat interval.
  const m = src.match(/AXUIElementSetMessagingTimeout\([^,]+,\s*([\d.]+)\)/)
  assert.ok(m, 'AXUIElementSetMessagingTimeout not set')
  assert.ok(Number(m[1]) > 0 && Number(m[1]) <= 1, 'per-call bound must be (0, 1]s')
})

test('the poked-tree retry re-resolves focus on a schedule, not gated on hadFocus', () => {
  // A pre-poke stub element sets hadFocus=true and used to skip the only
  // retry; a tree slower than the single 0.5s window was then missed forever.
  const obsStart = src.indexOf('func observe(')
  const obsBody = src.slice(obsStart, src.indexOf('\n// ', obsStart))
  assert.match(obsBody, /for delay in \[[\d., ]+\]/, 'retry schedule not found')
  assert.ok(!obsBody.includes('!hadFocus'), 'retries must not be gated on hadFocus')
})

test('every bounds emission records the frame it emitted (settle-clock dedupe)', () => {
  // emitBounds must take the already-read rect and store it as lastPolledFrame:
  // if the notification path skips the store, the poll re-emits a duplicate
  // bounds after every window drag and pushes the consumer's settle clock back.
  const fnStart = src.indexOf('func emitBounds(_ f: CGRect)')
  assert.ok(fnStart > -1, 'emitBounds must take the frame instead of re-reading it')
  const body = src.slice(fnStart, src.indexOf('\nfunc ', fnStart))
  assert.ok(body.includes('lastPolledFrame = f'), 'emitBounds must record the emitted frame')
})

test('packaged builds ship the helper binary next to the app', () => {
  // index.js resolves process.resourcesPath/ax-probe when app.isPackaged —
  // without these two hooks every .dmg silently ships a dead ghost icon (R12
  // hides the failure), while dev keeps working off the repo path.
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const extra = pkg.build?.extraResources ?? []
  assert.ok(
    extra.some((r) => (r.from ?? r) === 'helper/ax-probe' && (r.to ?? '') === 'ax-probe'),
    'build.extraResources must copy helper/ax-probe to Resources/ax-probe'
  )
  assert.match(pkg.scripts.dist, /helper:build/, 'dist must rebuild the helper before packaging')
})

test('swift source typechecks', (t) => {
  const find = spawnSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' })
  if (find.status !== 0) return t.skip('no swift toolchain on this machine')
  const check = spawnSync('xcrun', ['swiftc', '-typecheck', swiftPath], { encoding: 'utf8', timeout: 180000 })
  assert.equal(check.status, 0, `swiftc -typecheck failed:\n${check.stderr}`)
})
