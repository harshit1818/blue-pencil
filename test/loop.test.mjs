import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { setupSandbox } from './helpers/loop-sandbox.mjs'

// Mirror of the EXIT_* table at the top of loop.sh — keep in sync (see the NOTE there).
const EXIT = { OK: 0, STALL: 1, BRANCH_MOVED: 3, DIRTY: 4, INPROGRESS: 5, MAXITERS: 6, PUSH: 7, ITER_FAILED: 8, LOCKED: 9 }

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

test('a second loop refuses to run while the lock is held, and a run releases it', () => {
  const sb = setupSandbox()
  mkdirSync(join(sb.dir, '.loop', 'lock'), { recursive: true }) // simulate a loop already holding it
  const held = sb.run(2, { CLAUDE_ACTION: 'noop' })
  assert.equal(held.status, EXIT.LOCKED)

  // Release it, then a normal run must acquire and free the lock on exit.
  rmdirSync(join(sb.dir, '.loop', 'lock'))
  const clean = sb.run(2, { CLAUDE_ACTION: 'done' })
  assert.equal(clean.status, EXIT.OK)
  assert.ok(!sb.exists('.loop/lock'), 'lock must be released on exit')
})

test('a dirty working tree stops before the agent runs', () => {
  const sb = setupSandbox()
  sb.writeFile('leftover.txt', 'partial state from a dead iteration')
  const r = sb.run(3, { CLAUDE_ACTION: 'commit' })
  assert.equal(r.status, EXIT.DIRTY)
  assert.match(r.log, /working tree is dirty/)
  assert.ok(!r.log.includes('iteration 1/'), 'must not start an iteration on a dirty tree')
})

test('a [~] v:auto card blocks the board-clear exit (no false success)', () => {
  const sb = setupSandbox()
  // Simulate a dead iteration that left card #100 in progress, then committed nothing else.
  sb.writeFile('IMPLEMENTATION_PLAN.md', sb.read('IMPLEMENTATION_PLAN.md').replace('- [ ] #100', '- [~] #100'))
  sb.commitAll('simulate half-done card')
  const r = sb.run(3, { CLAUDE_ACTION: 'noop' })
  assert.equal(r.status, EXIT.INPROGRESS)
  assert.match(r.log, /in-progress \[~\] v:auto card/)
  assert.ok(!r.log.includes('board clear'), 'a [~] card must not read as board clear')
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

test('a hung iteration is killed by the timeout and retried, then aborts', () => {
  const sb = setupSandbox()
  const r = sb.run(3, { CLAUDE_ACTION: 'sleep', CLAUDE_SLEEP: '10', ITER_TIMEOUT: '1', RETRIES: '1', BACKOFF: '0' })
  assert.equal(r.status, EXIT.ITER_FAILED)
  assert.match(r.log, /retry 1\/1/)
  assert.match(r.log, /failed after 1 retries/)
})

test('a transient failure is retried and the loop continues', () => {
  // fail1: the call fails once, then succeeds (and commits) on the retry.
  const sb = setupSandbox()
  const r = sb.run(1, { CLAUDE_ACTION: 'fail1', RETRIES: '2', BACKOFF: '0' })
  assert.match(r.log, /retry 1\/2/)
  assert.notEqual(r.status, EXIT.ITER_FAILED)
  assert.equal(r.status, EXIT.MAXITERS) // committed but card not flipped -> work still queued
})

test('per-iteration telemetry is captured to .loop/iter-N.json and logged', () => {
  const sb = setupSandbox()
  sb.run(1, { CLAUDE_ACTION: 'cost' })
  assert.ok(sb.exists('.loop/iter-1.json'), 'iteration result JSON must be captured')
  assert.match(sb.read('.loop/iter-1.json'), /total_cost_usd/)
  assert.match(sb.read('.loop/loop.log'), /cost=\$0\.5/)
  assert.match(sb.read('.loop/loop.log'), /^\[\d{4}-\d{2}-\d{2}T/m) // timestamped lines
})

test('each committing iteration appends a telemetry line to PROGRESS.md', () => {
  const sb = setupSandbox()
  sb.run(2, { CLAUDE_ACTION: 'commit' }) // commits each iter but never flips the card
  const progress = sb.read('PROGRESS.md')
  const entries = progress.split('\n').filter((l) => /^- \[.*\] iter \d+\/\d+/.test(l))
  assert.equal(entries.length, 2, 'one committed line per iteration')
  // and it is tracked, not a dirty leftover
  assert.match(sb.read('.loop/loop.log'), /iteration 2\/2/)
})

test('consecutive push failures abort with the push code', () => {
  // No origin -> every push fails; agent commits so a push is attempted each iter.
  const sb = setupSandbox({ withOrigin: false })
  const r = sb.run(5, { CLAUDE_ACTION: 'commit', PUSH_FAIL_LIMIT: '2' })
  assert.equal(r.status, EXIT.PUSH)
  assert.match(r.log, /consecutive push failures/)
})
