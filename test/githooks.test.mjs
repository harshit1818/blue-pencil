import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, cpSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = join(process.cwd(), 'scripts', 'githooks', 'pre-commit')

// Runs the real pre-commit hook inside a throwaway git repo, with a fake `npm`
// earlier on PATH that exits `code`. Returns the hook's exit status.
function runHookWithFakeNpm(code) {
  const dir = mkdtempSync(join(tmpdir(), 'hook-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash\nexit ${code}\n`)
  chmodSync(join(bin, 'npm'), 0o755)
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
