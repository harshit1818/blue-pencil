#!/usr/bin/env node
// Triage an independent PR review (JSON from the reviewer agent) into what a machine
// may fix and what a human must decide. Pure functions here; loop.sh's remediation
// step calls the CLI at the bottom.
//
//   standards / correctness  -> objective: a bounded fix pass can address them, and
//                               `verify` + a re-review can PROVE the fix.
//   product / scope / other  -> for a human: alignment with product goals is not
//                               machine-verifiable, so it is surfaced, never auto-fixed.
//                               Unknown categories default here (safe side).
import { readFileSync } from 'node:fs'

const OBJECTIVE = new Set(['standards', 'correctness'])

// Tolerant parse: the agent is asked for raw JSON but may wrap it in ```json fences or
// stray prose. Extract the outermost {...} and parse; never throw.
export function parseReview(text) {
  const fail = { verdict: 'PARSE-ERROR', summary: 'could not parse the review output', findings: [], raw: text }
  if (!text || !text.trim()) return fail
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return fail
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return {
      verdict: obj.verdict || 'NEEDS-WORK',
      summary: obj.summary || '',
      findings: Array.isArray(obj.findings) ? obj.findings : [],
    }
  } catch {
    return fail
  }
}

export function triage(review) {
  const objective = []
  const product = []
  for (const f of review.findings || []) {
    ;(OBJECTIVE.has(String(f.category || '').toLowerCase()) ? objective : product).push(f)
  }
  return { objective, product }
}

const fmt = (f) => `- **${f.severity || '?'}** \`${f.location || '?'}\` — ${f.issue || ''}${f.fix ? ` _(fix: ${f.fix})_` : ''}`

export function renderComment(review) {
  const { objective, product } = triage(review)
  const out = [`### 🤖 Independent review — ${review.verdict}`, '']
  if (review.summary) out.push(review.summary, '')
  out.push(
    objective.length
      ? `**Standards / correctness (${objective.length})** — the loop will attempt to auto-fix these, re-verify, and re-review:`
      : '**Standards / correctness:** none.',
  )
  objective.forEach((f) => out.push(fmt(f)))
  out.push('')
  out.push(
    product.length
      ? `**Needs your decision (${product.length})** — product/scope alignment is yours to call, not auto-fixed:`
      : '**Needs your decision:** none.',
  )
  product.forEach((f) => out.push(fmt(f)))
  out.push('', '_Product decisions stay with a human; loop-issues.sh merges only when the review gate passes._')
  return out.join('\n')
}

// The driver's merge gate: overall LGTM and nothing objective survived remediation.
// Product findings never block — they are the PR's human checklist, and the LGTM
// verdict is the reviewer's lever to block on a product problem that matters.
export function mergeable(review) {
  return review.verdict === 'LGTM' && triage(review).objective.length === 0
}

export function renderProductChecklist(product) {
  if (!product.length) return ''
  return ['### 🧭 Product / scope decisions for a human', '', ...product.map((f) => `- [ ] \`${f.location || '?'}\` — ${f.issue || ''}`)].join('\n')
}

export function fixPrompt(objective) {
  const lines = objective.map((f, i) => `${i + 1}. [${f.category}] ${f.location || '?'} — ${f.issue}${f.fix ? ` (suggested: ${f.fix})` : ''}`)
  return `RALPH-FIX: address ONLY these standards/correctness findings from the review. Match the repo's conventions (AGENTS.md). Do NOT touch product/scope behaviour, do NOT change tests to pass, and do NOT commit — the loop runs verify and commits. If a finding is wrong or not safely fixable, leave it and say why.

${lines.join('\n')}`
}

function main() {
  const [cmd, file] = process.argv.slice(2)
  const review = parseReview(readFileSync(file, 'utf8'))
  const { objective, product } = triage(review)
  if (cmd === 'comment') process.stdout.write(renderComment(review))
  else if (cmd === 'count') process.stdout.write(String(objective.length))
  else if (cmd === 'fixprompt') process.stdout.write(fixPrompt(objective))
  else if (cmd === 'product') process.stdout.write(renderProductChecklist(product))
  else if (cmd === 'mergeable') {
    const ok = mergeable(review)
    process.stdout.write(ok ? 'mergeable\n' : `not mergeable: verdict=${review.verdict}, objective=${objective.length}\n`)
    process.exit(ok ? 0 : 1)
  } else {
    process.stderr.write(`usage: review-triage.mjs comment|count|fixprompt|product|mergeable <review.json>\n`)
    process.exit(2)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
