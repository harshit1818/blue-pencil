import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReview, triage, renderComment, renderProductChecklist, fixPrompt, mergeable } from '../scripts/review-triage.mjs'

const REVIEW = {
  verdict: 'NEEDS-WORK',
  summary: 'a few things',
  findings: [
    { category: 'standards', severity: 'minor', location: 'a.js:1', issue: 'semicolon', fix: 'drop it' },
    { category: 'correctness', severity: 'blocker', location: 'b.js:9', issue: 'off-by-one' },
    { category: 'product', severity: 'major', location: 'c.js:3', issue: 'is this the right UX?' },
    { category: 'scope', severity: 'minor', location: 'd.js:5', issue: 'unrelated change' },
  ],
}

test('parseReview tolerates code fences and surrounding prose', () => {
  const r = parseReview('here you go:\n```json\n{"verdict":"LGTM","findings":[]}\n```\nthanks')
  assert.equal(r.verdict, 'LGTM')
  assert.deepEqual(r.findings, [])
})

test('parseReview never throws on garbage', () => {
  const r = parseReview('not json at all')
  assert.equal(r.verdict, 'PARSE-ERROR')
  assert.deepEqual(r.findings, [])
})

test('triage splits standards/correctness (objective) from product/scope (human)', () => {
  const { objective, product } = triage(REVIEW)
  assert.deepEqual(objective.map((f) => f.location), ['a.js:1', 'b.js:9'])
  assert.deepEqual(product.map((f) => f.location), ['c.js:3', 'd.js:5'])
})

test('unknown categories default to the human side (safe)', () => {
  const { objective, product } = triage({ findings: [{ category: 'vibes', location: 'x', issue: 'y' }] })
  assert.equal(objective.length, 0)
  assert.equal(product.length, 1)
})

test('renderComment separates auto-fix from human-decision sections', () => {
  const c = renderComment(REVIEW)
  assert.match(c, /Standards \/ correctness \(2\)/)
  assert.match(c, /Needs your decision \(2\)/)
  assert.match(c, /merges only when the review gate passes/)
})

test('the fix prompt carries the RALPH-FIX marker and only objective findings', () => {
  const { objective } = triage(REVIEW)
  const p = fixPrompt(objective)
  assert.match(p, /RALPH-FIX/)
  assert.match(p, /a\.js:1/)
  assert.match(p, /b\.js:9/)
  assert.ok(!p.includes('c.js:3'), 'product findings must not reach the fix agent')
  assert.match(p, /do NOT commit/)
})

test('product checklist is empty when there are no product findings', () => {
  assert.equal(renderProductChecklist([]), '')
  assert.match(renderProductChecklist([{ location: 'c.js:3', issue: 'ux?' }]), /- \[ \] `c\.js:3`/)
})

const F = (category) => ({ category, severity: 'minor', location: 'x.js:1', issue: 'i' })

test('mergeable: LGTM with no objective findings', () => {
  assert.equal(mergeable({ verdict: 'LGTM', findings: [] }), true)
  assert.equal(mergeable({ verdict: 'LGTM', findings: [F('product')] }), true) // product never blocks
})

test('not mergeable: objective findings or non-LGTM verdict', () => {
  assert.equal(mergeable({ verdict: 'LGTM', findings: [F('correctness')] }), false)
  assert.equal(mergeable({ verdict: 'NEEDS-WORK', findings: [] }), false)
  assert.equal(mergeable({ verdict: 'PARSE-ERROR', findings: [] }), false)
})
