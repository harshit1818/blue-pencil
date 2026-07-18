import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync } from 'node:fs'
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
