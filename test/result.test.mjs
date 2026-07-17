import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from '../src/main/transform.js'
import { panelResult, clearPanel, stampRun, releaseBusy } from '../src/renderer/src/result.js'

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

// #21: the overlay's settings subscriber only relabeled the provider — a result
// from the previous provider stayed deliverable. Both hosts now invalidate
// through clearPanel on provider change.

test('provider switch drops every stale transient, including the overlay hint', () => {
  const calls = {}
  const set = Object.fromEntries(
    ['result', 'marks', 'error', 'copied', 'hint'].map((k) => [k, (v) => (calls[k] = v)])
  )
  clearPanel(set)
  assert.deepEqual(calls, { result: null, marks: null, error: null, copied: false, hint: null })
})

test('a host without the overlay-only hint setter still clears the rest', () => {
  const calls = {}
  const set = Object.fromEntries(
    ['result', 'marks', 'error', 'copied'].map((k) => [k, (v) => (calls[k] = v)])
  )
  clearPanel(set)
  assert.deepEqual(calls, { result: null, marks: null, error: null, copied: false })
})

// #42: sibling of #21 — a transform still in flight when the provider switches
// must not land a result produced by the previous provider. Runs are stamped
// with the current generation; clearPanel bumps it, so the stamp goes stale.

const noopSet = (gen) => ({ result() {}, marks() {}, error() {}, copied() {}, gen })

test('a run stamped before a provider switch reads stale after it', () => {
  const gen = { current: 0 }
  const fresh = stampRun(gen)
  assert.equal(fresh(), true)
  clearPanel(noopSet(gen))
  assert.equal(fresh(), false)
})

test('a run stamped after the switch stays fresh', () => {
  const gen = { current: 0 }
  clearPanel(noopSet(gen))
  const fresh = stampRun(gen)
  assert.equal(fresh(), true)
})

// #43: sibling of #42 — the overlay's show-reset now routes through clearPanel,
// so a re-summon bumps the generation (dropping runs from the previous summon)
// and clears the overlay-only busy flag in the same shared rule.

test('the show-reset drops busy and stales runs from the previous summon', () => {
  const gen = { current: 0 }
  const calls = {}
  const fresh = stampRun(gen)
  clearPanel({ ...noopSet(gen), busy: (v) => (calls.busy = v) })
  assert.equal(calls.busy, null)
  assert.equal(fresh(), false)
})

// Failure path of #42/#43: a stale run's finally must not clear a NEWER run's
// busy state — but when no newer run started, the stale run still owns busy and
// must release it, or run() (which refuses while busy) deadlocks the host.

test('releaseBusy releases only when the run still owns busy', () => {
  assert.equal(releaseBusy('proofread')('proofread'), null) // owner → release
  assert.equal(releaseBusy('proofread')('tone-warm'), 'tone-warm') // newer run B → untouched
  assert.equal(releaseBusy('proofread')(null), null) // already clear → stays clear
})

test('both hosts guard the failure path: stale rejections and busy release', () => {
  // node --test can't parse JSX, so lock the pattern statically (repo precedent:
  // aria-live, tokens-contrast). Fails if a host reverts to bare setError/setBusy.
  for (const host of ['App.jsx', 'HotkeyPopover.jsx']) {
    const src = readFileSync(new URL(`../src/renderer/src/${host}`, import.meta.url), 'utf8')
    assert.match(src, /if \(fresh\(\)\) setError\(ERROR_GENERIC\)/, `${host}: catch must be fresh-guarded`)
    assert.match(src, /setBusy\(releaseBusy\(id\)\)/, `${host}: finally must release via ownership`)
  }
})
