import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkTempGitRepo, writeExecutable, makeBin } from './helpers/git-sandbox.mjs'

const HOOK = join(process.cwd(), 'scripts', 'githooks', 'pre-commit')

// Runs the real pre-commit hook inside a throwaway git repo, with a fake `npm`
// earlier on PATH that exits `code`. Returns the hook's exit status.
function runHookWithFakeNpm(code) {
  const dir = mkTempGitRepo('hook-')
  const bin = makeBin(dir)
  writeExecutable(join(bin, 'npm'), `#!/usr/bin/env bash\nexit ${code}\n`)
  cpSync(HOOK, join(dir, 'pre-commit'))
  const r = spawnSync('bash', ['pre-commit'], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  return r.status
}

test('pre-commit hook fails the commit when verify is red', () => {
  assert.notEqual(runHookWithFakeNpm(1), 0)
})

test('pre-commit hook allows the commit when verify is green', () => {
  assert.equal(runHookWithFakeNpm(0), 0)
})

test('pre-commit hook refuses staged local-only planning docs even when verify is green', () => {
  // core.hooksPath (scripts/githooks) shadows .git/hooks entirely, so the
  // docs guard must live INSIDE this hook — a separate .git/hooks copy is dead
  // the moment setup-hooks wires the path.
  const dir = mkTempGitRepo('hook-docs-')
  const bin = makeBin(dir)
  writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nexit 0\n')
  cpSync(HOOK, join(dir, 'pre-commit'))
  mkdirSync(join(dir, 'docs', 'phase3'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'phase3', 'leak.md'), 'local only')
  spawnSync('git', ['add', 'docs/phase3/leak.md'], { cwd: dir })
  const r = spawnSync('bash', ['pre-commit'], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  })
  assert.notEqual(r.status, 0, 'staged docs/phase3 file must block the commit')
  assert.match(String(r.stderr), /local-only/)
})
