import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  qualifies,
  denylist,
  normalizeDenylist,
  DEFAULT_DENYLIST,
  EDITABLE_ROLES,
  SECURE_ROLES
} from '../src/main/field-qualify.js'

const bigField = { role: 'AXTextArea', bundleId: 'com.tinyspeck.slackmacgap', width: 800, height: 200 }

test('qualifying editable roles pass with adequate size', () => {
  for (const role of EDITABLE_ROLES) {
    assert.equal(qualifies({ ...bigField, role }), true, role)
  }
})

test('non-editable role fails', () => {
  assert.equal(qualifies({ ...bigField, role: 'AXButton' }), false)
  assert.equal(qualifies({ ...bigField, role: 'AXStaticText' }), false)
})

test('R2: secure fields never qualify, and no setting can override', () => {
  for (const role of SECURE_ROLES) {
    // secure by role
    assert.equal(qualifies({ ...bigField, role }), false, role)
    // secure by subrole on an otherwise-editable role
    assert.equal(qualifies({ ...bigField, role: 'AXTextField', subrole: role }), false, `subrole ${role}`)
    // an attacker-crafted setting cannot re-enable it
    assert.equal(qualifies({ ...bigField, role }, { allowSecure: true, denylist: [] }), false)
  }
})

test('sub-threshold bounds fail (search/address bars); above-threshold pass', () => {
  // single-line search bar: short + not enough area
  assert.equal(qualifies({ ...bigField, width: 300, height: 24 }), false)
  // tall enough on its own
  assert.equal(qualifies({ ...bigField, width: 200, height: 40 }), true)
  // short but wide enough by area (a real composer)
  assert.equal(qualifies({ ...bigField, width: 800, height: 30 }), true)
  // non-numeric bounds fail closed
  assert.equal(qualifies({ ...bigField, width: 'x', height: undefined }), false)
})

test('denylisted bundle ids fail — defaults and user entries', () => {
  assert.equal(qualifies({ ...bigField, bundleId: 'com.apple.Terminal' }), false)
  assert.equal(qualifies({ ...bigField, bundleId: 'com.microsoft.VSCode' }), false)
  assert.equal(qualifies({ ...bigField, bundleId: 'com.acme.custom' }), true)
  assert.equal(
    qualifies({ ...bigField, bundleId: 'com.acme.custom' }, { denylist: ['com.acme.custom'] }),
    false
  )
})

test('R3: defaults ship with a terminal and a code editor', () => {
  assert.ok(DEFAULT_DENYLIST.includes('com.apple.Terminal'))
  assert.ok(DEFAULT_DENYLIST.includes('com.microsoft.VSCode'))
  assert.ok(DEFAULT_DENYLIST.includes('com.apple.dt.Xcode'))
})

test('denylist() merges defaults with user entries', () => {
  const merged = denylist({ denylist: ['com.acme.custom'] })
  assert.ok(merged.includes('com.apple.Terminal'))
  assert.ok(merged.includes('com.acme.custom'))
})

test('normalizeDenylist round-trip: trims, drops junk, dedups, idempotent', () => {
  const raw = ['  com.a  ', 'com.a', '', '   ', 42, null, 'com.b']
  const once = normalizeDenylist(raw)
  assert.deepEqual(once, ['com.a', 'com.b'])
  assert.deepEqual(normalizeDenylist(once), once) // read-back returns the same
  assert.deepEqual(normalizeDenylist(undefined), [])
  assert.deepEqual(normalizeDenylist('not-an-array'), [])
})
