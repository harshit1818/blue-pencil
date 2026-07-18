import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderBoard, renderGhBlock, parseMarkers, nextIssue } from '../scripts/regen-board.mjs'

const issue = (number, title, ...labels) => ({ number, title, labels: labels.map((name) => ({ name })) })

const FIXTURE = [
  issue(6, 'A — Window & overlay state management', 'epic:A'),
  issue(7, 'A1 — overlay grows off the bottom', 'epic:A', 'severity:high', 'verify:human'),
  issue(51, 'A10 — extract clamp geometry helper', 'epic:A', 'severity:medium', 'verify:auto'),
  issue(11, 'A5 — saved bounds on missing display', 'epic:A', 'severity:medium', 'verify:auto'),
  issue(14, 'B — Renderer state', 'epic:B'),
  issue(20, 'B6 — model-input echo', 'epic:B', 'severity:low', 'verify:human'),
  issue(1, 'Overlay cursor-anchored', 'verify:human'),
  issue(99, 'Mystery issue with no verify label', 'epic:B', 'severity:low'),
]

const PREV = `# board
<!-- GH:BEGIN — regenerated -->

## stale content that must be replaced

- [x] #11 A5  saved bounds on missing display  · sev:medium · v:auto
- [!] #7  A1  overlay grows  · sev:high · v:human

<!-- GH:END -->
tail
`

test('sections are grouped by epic with the parent number in the header', () => {
  const block = renderGhBlock(FIXTURE, PREV)
  assert.match(block, /## A — Window & overlay state management \(#6\)/)
  assert.match(block, /## B — Renderer state \(#14\)/)
  assert.ok(!block.includes('#6  '), 'parent issue must not appear as a card')
})

test('cards sort by severity then number within a section', () => {
  const block = renderGhBlock(FIXTURE, PREV)
  const aCards = block.split('\n').filter((l) => l.startsWith('- ') && /#(7|11|51)\b/.test(l))
  assert.deepEqual(
    aCards.map((l) => l.match(/#(\d+)/)[1]),
    ['7', '11', '51'], // high(7) then medium sorted by number(11,51)
  )
})

test('existing [x]/[!]/[~] markers are preserved; new cards default to [ ]', () => {
  const block = renderGhBlock(FIXTURE, PREV)
  assert.match(block, /- \[x\] #11\b/)
  assert.match(block, /- \[!\] #7\b/)
  assert.match(block, /- \[ \] #51\b/)
})

test('issue missing a verify:* label lands in a flagged gap section as v:human', () => {
  const block = renderGhBlock(FIXTURE, PREV)
  assert.match(block, /classification gaps/)
  assert.match(block, /- \[ \] #99 .*· v:human/)
  // and it is NOT rendered inside its epic:B section
  const bSection = block.slice(block.indexOf('## B'), block.indexOf('## Ungrouped'))
  assert.ok(!bSection.includes('#99'), 'gap issue must not appear in its epic section')
})

test('issues with no epic land under Ungrouped', () => {
  const block = renderGhBlock(FIXTURE, PREV)
  assert.match(block, /## Ungrouped\n/)
  assert.match(block, /- \[ \] #1 /)
})

test('renderBoard replaces only the GH block and is idempotent', () => {
  const once = renderBoard(PREV, FIXTURE)
  assert.match(once, /^# board/)
  assert.match(once, /tail\n?$/)
  assert.ok(!once.includes('stale content'), 'old block content must be gone')
  const twice = renderBoard(once, FIXTURE)
  assert.equal(twice, once, 'regen must be idempotent')
})

test('parseMarkers reads markers by issue number', () => {
  const m = parseMarkers(PREV)
  assert.equal(m.get(11), 'x')
  assert.equal(m.get(7), '!')
  assert.equal(m.get(51), undefined)
})

const NEXT_ISSUES = [
  issue(6, 'A — Section', 'epic:A'),
  issue(100, 'A1 — high card', 'epic:A', 'severity:high', 'verify:auto'),
  issue(102, 'A2 — medium card', 'epic:A', 'severity:medium', 'verify:auto'),
  issue(101, 'A3 — human card', 'epic:A', 'severity:critical', 'verify:human'),
]
const EMPTY_BOARD = '# board\n<!-- GH:BEGIN -->\n<!-- GH:END -->\n'

test('nextIssue picks the top v:auto card in board order', () => {
  assert.equal(nextIssue(NEXT_ISSUES, EMPTY_BOARD), 100) // severity high before medium
})

test('nextIssue honours the skip list', () => {
  assert.equal(nextIssue(NEXT_ISSUES, EMPTY_BOARD, new Set([100])), 102)
  assert.equal(nextIssue(NEXT_ISSUES, EMPTY_BOARD, new Set([100, 102])), null)
})

test('nextIssue never picks v:human cards', () => {
  const humansOnly = NEXT_ISSUES.filter((i) => i.number !== 100 && i.number !== 102)
  assert.equal(nextIssue(humansOnly, EMPTY_BOARD), null) // #101 is critical but v:human
})

test('nextIssue skips non-[ ] markers (blocked/in-progress/done)', () => {
  const prev = '# board\n<!-- GH:BEGIN -->\n- [!] #100  A1  high card  · sev:high · v:auto\n<!-- GH:END -->\n'
  assert.equal(nextIssue(NEXT_ISSUES, prev), 102)
})
