// Runs the real loop.sh inside a throwaway git repo with stubbed `claude` and `gh`,
// so the harness's control flow (exit codes, stall/dirty/branch guards, timeout,
// retry, telemetry, lock) is testable offline. No network, no real agent.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()

// One epic parent, one open v:auto card (#100 -> a [ ] todo), one v:human card.
export const DEFAULT_ISSUES = [
  { number: 6, title: 'A — Section', labels: [{ name: 'epic:A' }] },
  { number: 100, title: 'A1 — an auto card', labels: [{ name: 'epic:A' }, { name: 'severity:high' }, { name: 'verify:auto' }] },
  { number: 101, title: 'A2 — a human card', labels: [{ name: 'epic:A' }, { name: 'severity:low' }, { name: 'verify:human' }] },
]

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })

// action: one of noop | commit | done | branch | sleep | failN (e.g. fail1) | cost
function writeClaudeStub(bin) {
  writeFileSync(
    join(bin, 'claude'),
    `#!/usr/bin/env bash
cat >/dev/null   # consume the piped prompt
action="\${CLAUDE_ACTION:-noop}"
case "$action" in
  noop)   exit 0 ;;
  done)   touch .loop/DONE; exit 0 ;;
  branch) git checkout -q -b hijacked; exit 0 ;;
  sleep)  sleep "\${CLAUDE_SLEEP:-5}"; exit 0 ;;
  commit) git commit --allow-empty -q -m "stub work"; echo '{"total_cost_usd":0.0123,"duration_ms":42}'; exit 0 ;;
  cost)   git commit --allow-empty -q -m "stub work"; echo '{"total_cost_usd":0.5,"duration_ms":99}'; exit 0 ;;
  fail*)  n="\${action#fail}"; c=.loop/stub-fails
          seen=$(cat "$c" 2>/dev/null || echo 0)
          if [ "$seen" -lt "$n" ]; then echo $((seen+1)) >"$c"; exit 1; fi
          git commit --allow-empty -q -m "stub work after retry"; exit 0 ;;
  *) exit 0 ;;
esac
`,
  )
  chmodSync(join(bin, 'claude'), 0o755)
}

function writeGhStub(bin, jsonPath) {
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\ncat ${jsonPath}\n`)
  chmodSync(join(bin, 'gh'), 0o755)
}

export function setupSandbox({ issues = DEFAULT_ISSUES, withOrigin = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'loop-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'checkout', '-q', '-b', 'work')

  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const jsonPath = join(dir, 'issues.json')
  writeFileSync(jsonPath, JSON.stringify(issues))
  writeClaudeStub(bin)
  writeGhStub(bin, jsonPath)

  mkdirSync(join(dir, 'scripts'))
  cpSync(join(ROOT, 'loop.sh'), join(dir, 'loop.sh'))
  cpSync(join(ROOT, 'PROMPT_build.md'), join(dir, 'PROMPT_build.md'))
  cpSync(join(ROOT, 'scripts', 'regen-board.mjs'), join(dir, 'scripts', 'regen-board.mjs'))
  writeFileSync(join(dir, 'IMPLEMENTATION_PLAN.md'), '# board\n<!-- GH:BEGIN -->\n<!-- GH:END -->\n')

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  // Pre-populate the board so loop.sh's own regen is an idempotent no-op (clean tree).
  execFileSync('node', ['scripts/regen-board.mjs'], { cwd: dir, env, stdio: 'ignore' })
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'seed')

  if (withOrigin) {
    const origin = mkdtempSync(join(tmpdir(), 'origin-'))
    git(origin, 'init', '-q', '--bare')
    git(dir, 'remote', 'add', 'origin', origin)
    git(dir, 'push', '-q', '-u', 'origin', 'work')
  }

  return {
    dir,
    bin,
    env,
    run(maxIters = 2, extraEnv = {}) {
      const r = spawnSync('bash', ['loop.sh', String(maxIters)], {
        cwd: dir,
        env: { ...env, ...extraEnv },
        encoding: 'utf8',
      })
      return {
        status: r.status,
        stdout: r.stdout || '',
        stderr: r.stderr || '',
        log: existsSync(join(dir, '.loop', 'loop.log')) ? readFileSync(join(dir, '.loop', 'loop.log'), 'utf8') : '',
      }
    },
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
    exists: (rel) => existsSync(join(dir, rel)),
    writeFile: (rel, content) => writeFileSync(join(dir, rel), content),
  }
}
