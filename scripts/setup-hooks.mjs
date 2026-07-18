#!/usr/bin/env node
// Points git at scripts/githooks so the pre-commit verify gate is active in every
// clone. Runs from the `prepare` npm lifecycle (on install). No-ops outside a git
// checkout (CI tarball installs) so it never fails an install.
import { execFileSync } from 'node:child_process'

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
} catch {
  process.exit(0)
}

try {
  execFileSync('git', ['config', 'core.hooksPath', 'scripts/githooks'], { stdio: 'ignore' })
  console.error('setup-hooks: core.hooksPath -> scripts/githooks')
} catch {
  console.error('setup-hooks: could not set core.hooksPath (skipping)')
}
