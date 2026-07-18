#!/usr/bin/env node
// Regenerates the GH:BEGIN/GH:END block of IMPLEMENTATION_PLAN.md from live GitHub
// issues. This replaces PROMPT_plan.md — the board is a pure projection of labels, so
// a script does it deterministically and for free instead of burning a plan-mode agent
// iteration (which also exit-coded its own convergence as a stall failure).
//
// Card text comes from the GitHub title (single source of truth). Only the [x]/[!]/[~]
// marker is carried over from the previous board — ponytail: notes under a still-open
// done card are dropped; once merged the issue closes and the card leaves the board
// anyway, and learnings belong in git/PROGRESS.md, not the queue.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BEGIN = '<!-- GH:BEGIN'
const END = '<!-- GH:END'
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

const labelSet = (issue) => new Set(issue.labels.map((l) => l.name))
const epicOf = (labels) => [...labels].find((n) => n.startsWith('epic:'))?.slice(5)
const sevOf = (labels) => [...labels].find((n) => n.startsWith('severity:'))?.slice(9)
const verifyOf = (labels) => [...labels].find((n) => n.startsWith('verify:'))?.slice(7)

// The "<Letter> — desc" / "<Letter><n> — desc" title convention, parsed once:
//   "A — Window & overlay state" -> { letter: 'A', code: null, desc: 'Window …' }  (section header)
//   "A1 — overlay grows"         -> { letter: 'A', code: 'A1', desc: 'overlay grows' }  (card)
//   "L1 verify hook" (no em dash)-> { letter: null, code: null, desc: 'L1 verify hook' }
// A header is a title with a letter and no code; a card has a code (or none, for
// titles that don't follow the convention).
function parseTitle(title) {
  const m = title.match(/^([A-Z])(\d+)? —\s+(.*)$/s)
  if (!m) return { letter: null, code: null, desc: title }
  const [, letter, digits, desc] = m
  return { letter, code: digits ? letter + digits : null, desc }
}

export function parseMarkers(content) {
  const markers = new Map()
  for (const m of content.matchAll(/^- \[([x!~])\] #(\d+)\b/gm)) markers.set(Number(m[2]), m[1])
  return markers
}

function cardLine(issue, marker) {
  const labels = labelSet(issue)
  const { code, desc } = parseTitle(issue.title)
  const sev = sevOf(labels)
  const verify = verifyOf(labels) === 'auto' ? 'v:auto' : 'v:human'
  const head = code ? `#${issue.number}  ${code}  ${desc}` : `#${issue.number}  ${desc}`
  return `- [${marker}] ${head}  · sev:${sev || '—'} · ${verify}`
}

export function renderGhBlock(issues, prevContent) {
  const markers = parseMarkers(prevContent)
  const mark = (n) => markers.get(n) || ' '

  const parents = new Map() // letter -> {number, title}
  const parentNums = new Set()
  for (const it of issues) {
    const { letter, code, desc } = parseTitle(it.title)
    if (letter && !code && labelSet(it).has(`epic:${letter}`) && !sevOf(labelSet(it))) {
      parents.set(letter, { number: it.number, title: desc })
      parentNums.add(it.number)
    }
  }

  const cards = issues.filter((it) => !parentNums.has(it.number))
  const gaps = cards.filter((it) => !verifyOf(labelSet(it))) // classification gaps
  const gapNums = new Set(gaps.map((it) => it.number))

  const bySev = (a, b) =>
    (SEV_ORDER[sevOf(labelSet(a))] ?? 9) - (SEV_ORDER[sevOf(labelSet(b))] ?? 9) ||
    a.number - b.number

  const out = []
  for (const letter of [...parents.keys()].sort()) {
    const { number, title } = parents.get(letter)
    const inSection = cards
      .filter((it) => epicOf(labelSet(it)) === letter && !gapNums.has(it.number))
      .sort(bySev)
    if (!inSection.length) continue
    out.push(`## ${letter} — ${title} (#${number})`, '')
    for (const it of inSection) out.push(cardLine(it, mark(it.number)))
    out.push('')
  }

  const ungrouped = cards
    .filter((it) => !epicOf(labelSet(it)) && !gapNums.has(it.number))
    .sort((a, b) => a.number - b.number)
  if (ungrouped.length) {
    out.push('## Ungrouped', '')
    for (const it of ungrouped) out.push(cardLine(it, mark(it.number)))
    out.push('')
  }

  if (gaps.length) {
    out.push('## Ungrouped — classification gaps (needs a verify:* label; defaulted v:human)', '')
    for (const it of gaps.sort((a, b) => a.number - b.number)) out.push(cardLine(it, mark(it.number)))
    out.push('')
  }

  return out.join('\n').trimEnd()
}

export function renderBoard(prevContent, issues) {
  const lines = prevContent.split('\n')
  const b = lines.findIndex((l) => l.startsWith(BEGIN))
  const e = lines.findIndex((l) => l.startsWith(END))
  if (b === -1 || e === -1 || e < b) throw new Error('IMPLEMENTATION_PLAN.md: GH:BEGIN/GH:END markers not found')
  const block = renderGhBlock(issues, prevContent)
  return [...lines.slice(0, b + 1), '', block, '', ...lines.slice(e)].join('\n')
}

function main() {
  const json = execFileSync('gh', ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,labels'], {
    encoding: 'utf8',
  })
  const issues = JSON.parse(json)
  const path = 'IMPLEMENTATION_PLAN.md'
  const prev = readFileSync(path, 'utf8')
  const next = renderBoard(prev, issues)
  if (next === prev) {
    console.error('regen-board: already in sync')
    return
  }
  writeFileSync(path, next)
  console.error('regen-board: IMPLEMENTATION_PLAN.md updated')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
