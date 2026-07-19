// End-to-end tests for the per-issue driver (loop-issues.sh) in the offline sandbox:
// stubbed claude "flip" delivers a card; stubbed gh "pr merge" pushes HEAD to the base
// branch, so the driver's --ff-only pull after a merge is exercised for real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { setupSandbox } from './helpers/loop-sandbox.mjs'

// Driver exit codes — mirror of the EXIT_* table in loop-issues.sh (keep in sync).
const EXIT = { OK: 0, BADARGS: 2, DIRTY: 4, LOCKED: 9, INNER: 10, MERGE: 11 }

// Sandbox base branch is `work`; flip = "agent delivers the card" stub action.
const ENV = { BASE: 'work', CLAUDE_ACTION: 'flip', ITERS_PER_ISSUE: '3' }

function runDriver(sb, maxIssues = 2, extraEnv = {}) {
  const r = spawnSync('bash', ['loop-issues.sh', String(maxIssues)], {
    cwd: sb.dir,
    env: { ...sb.env, ...ENV, ...extraEnv },
    encoding: 'utf8',
  })
  const logPath = join(sb.dir, '.loop', 'issues.log')
  return {
    status: r.status,
    stderr: r.stderr || '',
    log: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '',
    gh: sb.exists('.loop/gh-calls.log') ? sb.read('.loop/gh-calls.log') : '',
  }
}

const originLog = (sb) =>
  execFileSync('git', ['log', 'origin/work', '--pretty=%s'], { cwd: sb.dir, encoding: 'utf8' })

test('happy path: delivers #100, merge gate passes, base advances, driver ends on base', () => {
  const sb = setupSandbox()
  const r = runDriver(sb)
  assert.equal(r.status, EXIT.OK)
  assert.match(r.gh, /pr ready loop\/issue-100/)
  assert.match(r.gh, /pr merge loop\/issue-100 --merge --delete-branch/)
  assert.match(r.gh, /--subject feat: card #100 \(Closes #100\) \(#100\)/) // merge subject = PR title, not "merge: loop/issue-100"
  assert.ok(!/--subject merge: loop\/issue-100/.test(r.gh), 'merge subject must not be loop bookkeeping')
  assert.match(originLog(sb), /feat: card #100 \(Closes #100\)/) // the "merge" landed on base
  assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: sb.dir, encoding: 'utf8' }).trim(), 'work')
  assert.match(r.log, /1 merged/)
})

test('gate failure: objective finding survives, PR is left unmerged, queue still ends clean', () => {
  const sb = setupSandbox()
  const r = runDriver(sb, 2, { STUB_OBJECTIVE: '1', REMEDIATION_ROUNDS: '0' })
  assert.equal(r.status, EXIT.OK)
  assert.ok(!/pr merge/.test(r.gh), 'must not merge on a failed gate')
  assert.match(r.log, /not merging #100/)
  assert.ok(!/feat: card #100/.test(originLog(sb)), 'base must not advance')
})

test('inner loop failure stops the driver with EXIT_INNER', () => {
  const sb = setupSandbox()
  const r = runDriver(sb, 2, { CLAUDE_ACTION: 'noop', STALL_LIMIT: '1' })
  assert.equal(r.status, EXIT.INNER)
  assert.match(r.log, /loop\.sh exited rc=/)
})

test('AUTO_MERGE=0 delivers but never merges', () => {
  const sb = setupSandbox()
  const r = runDriver(sb, 2, { AUTO_MERGE: '0' })
  assert.equal(r.status, EXIT.OK)
  assert.ok(!/pr merge/.test(r.gh))
  assert.match(r.log, /not merging #100/)
})

test('two v:auto issues merge sequentially, each from the advanced base', () => {
  const issues = [
    { number: 6, title: 'A — Section', labels: [{ name: 'epic:A' }] },
    { number: 100, title: 'A1 — first', labels: [{ name: 'epic:A' }, { name: 'severity:high' }, { name: 'verify:auto' }] },
    { number: 102, title: 'A2 — second', labels: [{ name: 'epic:A' }, { name: 'severity:medium' }, { name: 'verify:auto' }] },
  ]
  const sb = setupSandbox({ issues })
  const r = runDriver(sb, 3)
  assert.equal(r.status, EXIT.OK)
  const log = originLog(sb)
  assert.match(log, /feat: card #100/)
  assert.match(log, /feat: card #102/)
  assert.match(r.log, /2 merged/)
})

test('MAX_ISSUES must be numeric', () => {
  const sb = setupSandbox()
  const r = spawnSync('bash', ['loop-issues.sh', 'abc'], { cwd: sb.dir, env: sb.env, encoding: 'utf8' })
  assert.equal(r.status, EXIT.BADARGS)
})

test('issues with open loop/issue-N PRs are skipped at startup (resume safety)', () => {
  const sb = setupSandbox()
  mkdirSync(join(sb.dir, '.loop'), { recursive: true })
  writeFileSync(
    join(sb.dir, '.loop', 'pr-list.json'),
    JSON.stringify([{ headRefName: 'loop/issue-100' }, { headRefName: 'feat/unrelated' }]),
  )
  const r = runDriver(sb, 2)
  assert.equal(r.status, EXIT.OK)
  assert.match(r.log, /skipping issue\(s\) with open PRs: 100/)
  assert.match(r.log, /queue clear after 0 issue/)
  assert.ok(!sb.exists('.loop/claude-stdin.log'), 'agent must not run for a parked issue')
})

test('after a merge, a parked PR behind base is caught up (resync wiring)', () => {
  const sb = setupSandbox()
  const g = (...a) => execFileSync('git', a, { cwd: sb.dir, env: sb.env, encoding: 'utf8' })
  // A parked PR whose branch sits at the old base, one trivial commit ahead.
  g('checkout', '-q', '-b', 'loop/issue-102')
  writeFileSync(join(sb.dir, 'docs-x.md'), 'parked\n')
  g('add', '-A'); g('commit', '-q', '-m', 'parked work')
  g('push', '-q', 'origin', 'loop/issue-102')
  g('checkout', '-q', 'work'); g('branch', '-q', '-D', 'loop/issue-102')
  mkdirSync(join(sb.dir, '.loop'), { recursive: true })
  writeFileSync(join(sb.dir, '.loop', 'pr-list.json'), JSON.stringify([{ headRefName: 'loop/issue-102' }]))

  const r = runDriver(sb) // delivers + merges #100, advancing base
  assert.equal(r.status, EXIT.OK)
  assert.match(r.log, /resync:/)
  // The parked branch now contains the merged card commit — it caught up to base.
  assert.match(g('log', 'origin/loop/issue-102', '--pretty=%s'), /feat: card #100/)
})

test('a stale remote branch from a closed PR is cleared before re-delivery', () => {
  const sb = setupSandbox()
  // Simulate an old, closed-PR run: a divergent remote loop/issue-100 (no pr-list entry).
  execFileSync('git', ['checkout', '-q', '-b', 'stale'], { cwd: sb.dir })
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'stale old attempt'], { cwd: sb.dir })
  execFileSync('git', ['push', '-q', 'origin', 'stale:refs/heads/loop/issue-100'], { cwd: sb.dir })
  execFileSync('git', ['checkout', '-q', 'work'], { cwd: sb.dir })
  execFileSync('git', ['branch', '-q', '-D', 'stale'], { cwd: sb.dir })

  const r = runDriver(sb)
  assert.equal(r.status, EXIT.OK)
  assert.match(r.log, /1 merged/)
  assert.ok(!originLog(sb).includes('stale old attempt'), 'the stale attempt must not survive')
})
