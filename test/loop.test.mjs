import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupSandbox, DEFAULT_ISSUES } from './helpers/loop-sandbox.mjs'

// Exit codes mirror the table documented at the top of loop.sh.
const EXIT = { OK: 0, STALL: 1, BRANCH_MOVED: 3, MAXITERS: 6, PUSH: 7 }

test('board clear (no [ ] v:auto cards) exits OK without calling the agent', () => {
  // Only a v:human card open -> the projected board has no [ ] v:auto card.
  const issues = [
    { number: 6, title: 'A — Section', labels: [{ name: 'epic:A' }] },
    { number: 101, title: 'A2 — human only', labels: [{ name: 'epic:A' }, { name: 'severity:low' }, { name: 'verify:human' }] },
  ]
  const sb = setupSandbox({ issues })
  const r = sb.run(3)
  assert.equal(r.status, EXIT.OK)
  assert.match(r.log, /board clear/)
})

test('a spinning agent (no commits) stops with the stall code, not OK', () => {
  const sb = setupSandbox()
  const r = sb.run(5, { CLAUDE_ACTION: 'noop', STALL_LIMIT: '2' })
  assert.equal(r.status, EXIT.STALL)
  assert.match(r.log, /spinning/)
})

test('the DONE sentinel exits OK', () => {
  const sb = setupSandbox()
  const r = sb.run(5, { CLAUDE_ACTION: 'done' })
  assert.equal(r.status, EXIT.OK)
  assert.match(r.log, /DONE sentinel/)
})

test('a checkout switched off the work branch aborts with the branch-moved code', () => {
  const sb = setupSandbox()
  const r = sb.run(5, { CLAUDE_ACTION: 'branch' })
  assert.equal(r.status, EXIT.BRANCH_MOVED)
  assert.match(r.log, /checkout moved/)
})

test('exhausting iterations with v:auto work still queued exits MAXITERS, not OK', () => {
  // Agent commits each iteration but never flips the card, so todo stays > 0.
  const sb = setupSandbox()
  const r = sb.run(2, { CLAUDE_ACTION: 'commit' })
  assert.equal(r.status, EXIT.MAXITERS)
  assert.match(r.log, /still queued/)
})

test('consecutive push failures abort with the push code', () => {
  // No origin -> every push fails; agent commits so a push is attempted each iter.
  const sb = setupSandbox({ withOrigin: false })
  const r = sb.run(5, { CLAUDE_ACTION: 'commit', PUSH_FAIL_LIMIT: '2' })
  assert.equal(r.status, EXIT.PUSH)
  assert.match(r.log, /consecutive push failures/)
})
