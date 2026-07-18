// Shared primitives for tests that drive real bash/git against a throwaway repo with
// stubbed executables on PATH. Used by githooks.test.mjs and loop-sandbox.mjs.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })

export function mkTempGitRepo(prefix, { withUser = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  git(dir, 'init', '-q')
  if (withUser) {
    git(dir, 'config', 'user.email', 't@t')
    git(dir, 'config', 'user.name', 't')
  }
  return dir
}

// Write an executable stub (chmod +x). Returns its path.
export function writeExecutable(path, content) {
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  return path
}

// Create a bin/ dir under `dir` for PATH-shimmed stub executables.
export function makeBin(dir) {
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  return bin
}
