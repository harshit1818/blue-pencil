// scripts/resync-pr.sh keeps a parked loop/issue-N PR mergeable as $BASE advances,
// auto-resolving ONLY the loop's bookkeeping (board + PROGRESS.md) and aborting on
// any real conflict. Driven against a real throwaway repo via the loop sandbox.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { setupSandbox } from './helpers/loop-sandbox.mjs'

const g = (sb, ...args) => execFileSync('git', args, { cwd: sb.dir, env: sb.env, encoding: 'utf8' })
const write = (sb, rel, content) => {
  mkdirSync(dirname(join(sb.dir, rel)), { recursive: true })
  writeFileSync(join(sb.dir, rel), content)
}
const resync = (sb, branch) =>
  execFileSync('bash', ['scripts/resync-pr.sh', branch], { cwd: sb.dir, env: { ...sb.env, BASE: 'work' }, encoding: 'utf8' })

// Push a parked branch that touched `files`, then advance `work` with `workFiles`.
function park(sb, branch, files, workFiles) {
  g(sb, 'checkout', '-q', '-b', branch)
  for (const [rel, content] of Object.entries(files)) write(sb, rel, content)
  g(sb, 'add', '-A')
  g(sb, 'commit', '-q', '-m', `parked work on ${branch}`)
  g(sb, 'push', '-q', 'origin', branch)

  g(sb, 'checkout', '-q', 'work')
  for (const [rel, content] of Object.entries(workFiles)) write(sb, rel, content)
  g(sb, 'add', '-A')
  g(sb, 'commit', '-q', '-m', 'work advanced')
  g(sb, 'push', '-q', 'origin', 'work')
  g(sb, 'branch', '-q', '-D', branch) // resync must rebuild from origin
}

test('bookkeeping-only conflict auto-resolves and pushes', () => {
  const sb = setupSandbox()
  const board = sb.read('IMPLEMENTATION_PLAN.md')
  park(
    sb,
    'loop/issue-100',
    { 'IMPLEMENTATION_PLAN.md': board.replace('- [ ] #100', '- [x] #100'), 'PROGRESS.md': 'branch line\n' },
    { 'IMPLEMENTATION_PLAN.md': board.replace('- [ ] #100', '- [~] #100'), 'PROGRESS.md': 'main line\n' },
  )

  const out = resync(sb, 'loop/issue-100')
  assert.match(out, /resynced/)
  // The branch now contains work's commit and no conflict markers survive.
  assert.match(g(sb, 'log', 'origin/loop/issue-100', '--pretty=%s'), /work advanced/)
  assert.ok(!sb.read('IMPLEMENTATION_PLAN.md').includes('<<<<<<<'), 'board must be marker-free')
  const progress = sb.read('PROGRESS.md')
  assert.ok(progress.includes('branch line') && progress.includes('main line'), 'PROGRESS.md unions both sides')
})

test('a real (non-bookkeeping) conflict aborts and leaves the branch untouched', () => {
  const sb = setupSandbox()
  park(
    sb,
    'loop/issue-100',
    { 'src/feature.js': 'export const v = "branch"\n' },
    { 'src/feature.js': 'export const v = "work"\n' },
  )

  let code = 0,
    out = ''
  try {
    out = resync(sb, 'loop/issue-100')
  } catch (e) {
    code = e.status
    out = String(e.stdout || '')
  }
  assert.equal(code, 3, 'real conflict must exit 3')
  assert.match(out, /real conflict in src\/feature\.js/)
  // The branch was NOT advanced and no merge is left in progress.
  assert.ok(!g(sb, 'log', 'origin/loop/issue-100', '--pretty=%s').includes('work advanced'))
  assert.ok(!sb.read('src/feature.js').includes('<<<<<<<'), 'merge must be aborted, tree clean')
})
