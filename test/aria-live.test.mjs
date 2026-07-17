import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// #26: the error row, result panel and busy state in ActionPanel must carry
// live-region semantics, or screen readers announce nothing when the product's
// entire output appears. Asserted statically on the source, same pattern as
// the #fff ban in tokens-contrast.test.mjs.

const src = readFileSync(new URL('../src/renderer/src/ActionPanel.jsx', import.meta.url), 'utf8')
const errorBranch = src.indexOf('{error && (')
const resultBranch = src.indexOf('{result && (')

test('ActionPanel renders both an error branch and a result branch', () => {
  assert.ok(errorBranch !== -1 && resultBranch !== -1 && errorBranch < resultBranch)
})

test('error row is role="alert"', () => {
  const idx = src.indexOf('role="alert"')
  assert.ok(idx > errorBranch && idx < resultBranch, 'role="alert" missing from the error row')
})

test('result container is a polite status live region', () => {
  const status = src.indexOf('role="status"')
  const live = src.indexOf('aria-live="polite"')
  assert.ok(status > resultBranch, 'role="status" missing from the result container')
  assert.ok(live > resultBranch, 'aria-live="polite" missing from the result container')
})

test('panel exposes aria-busy while a transform runs', () => {
  assert.match(src, /aria-busy=\{!!busy\}/)
})
