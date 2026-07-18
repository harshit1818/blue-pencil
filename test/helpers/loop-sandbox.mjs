// Runs the real loop.sh inside a throwaway git repo with stubbed `claude` and `gh`,
// so the harness's control flow (exit codes, stall/dirty/branch guards, timeout,
// retry, telemetry, lock) is testable offline. No network, no real agent.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, mkTempGitRepo, writeExecutable, makeBin } from './git-sandbox.mjs'

const ROOT = process.cwd()

// One epic parent, one open v:auto card (#100 -> a [ ] todo), one v:human card.
export const DEFAULT_ISSUES = [
  { number: 6, title: 'A — Section', labels: [{ name: 'epic:A' }] },
  { number: 100, title: 'A1 — an auto card', labels: [{ name: 'epic:A' }, { name: 'severity:high' }, { name: 'verify:auto' }] },
  { number: 101, title: 'A2 — a human card', labels: [{ name: 'epic:A' }, { name: 'severity:low' }, { name: 'verify:human' }] },
]

// action: one of noop | commit | done | branch | sleep | failN (e.g. fail1) | cost
function writeClaudeStub(bin) {
  writeExecutable(
    join(bin, 'claude'),
    `#!/usr/bin/env bash
input="$(cat)"   # consume the piped prompt
printf '%s' "$input" >> .loop/claude-stdin.log   # capture so tests can assert on it
# The review + fix agents are separate claude calls (their prompts carry markers).
# They must NOT run the iteration action.
case "$input" in
  *RALPH-PR-REVIEW*)
    c=.loop/review-round; n="$(cat "$c" 2>/dev/null || echo 0)"; echo $((n + 1)) > "$c"
    if [ "$n" -eq 0 ] && [ "\${STUB_OBJECTIVE:-0}" = 1 ]; then
      echo '{"verdict":"NEEDS-WORK","summary":"stub","findings":[{"category":"standards","severity":"minor","location":"a.js:1","issue":"x","fix":"y"},{"category":"product","severity":"major","location":"b.js:2","issue":"p"}]}'
    else
      echo '{"verdict":"LGTM","summary":"stub","findings":[{"category":"product","severity":"minor","location":"b.js:2","issue":"p"}]}'
    fi
    exit 0 ;;
  *RALPH-FIX*) echo applied >> fix-applied.txt; exit 0 ;;
esac
action="\${CLAUDE_ACTION:-noop}"
case "$action" in
  noop)   exit 0 ;;
  done)   touch .loop/DONE; exit 0 ;;
  branch) git checkout -q -b hijacked; exit 0 ;;
  sleep)  sleep "\${CLAUDE_SLEEP:-5}"; exit 0 ;;
  commit) git commit --allow-empty -q -m "stub work"; echo '{"total_cost_usd":0.0123,"duration_ms":42}'; exit 0 ;;
  flip)   # deliver the targeted card: flip [ ] -> [x] on the board and commit
          n="$(printf '%s' "$input" | sed -n 's/.*Work ONLY on GitHub issue #\\([0-9]*\\).*/\\1/p' | head -1)"
          node -e '
            const fs = require("fs")
            const n = process.argv[1], p = "IMPLEMENTATION_PLAN.md"
            const s = fs.readFileSync(p, "utf8")
            fs.writeFileSync(p, s.replace("- [ ] #" + n + " ", "- [x] #" + n + " "))
          ' "$n"
          git commit -aq -m "feat: card #$n (Closes #$n)"
          exit 0 ;;
  cost)   git commit --allow-empty -q -m "stub work"; echo '{"total_cost_usd":0.5,"duration_ms":99}'; exit 0 ;;
  fail*)  n="\${action#fail}"; c=.loop/stub-fails
          seen=$(cat "$c" 2>/dev/null || echo 0)
          if [ "$seen" -lt "$n" ]; then echo $((seen+1)) >"$c"; exit 1; fi
          git commit --allow-empty -q -m "stub work after retry"; exit 0 ;;
  *) exit 0 ;;
esac
`,
  )
}

function writeGhStub(bin, jsonPath) {
  // Arg-aware: `issue list` feeds regen-board; `pr view/create/comment` drive the
  // draft-PR + review flow. Every call is logged so tests can assert the wiring.
  writeExecutable(
    join(bin, 'gh'),
    `#!/usr/bin/env bash
echo "gh $*" >> .loop/gh-calls.log 2>/dev/null || true
case "$1" in
  issue) cat ${jsonPath} ;;
  pr)
    case "$2" in
      view)    [ -f .loop/pr-exists ] && exit 0 || exit 1 ;;
      create)  : > .loop/pr-exists; echo "https://example.test/pr/1" ;;
      comment) : ;;
      ready)   : ;;
      merge)   git push -q origin "HEAD:\${BASE:-main}" ;;
      *) : ;;
    esac ;;
  *) : ;;
esac
`,
  )
}

export function setupSandbox({ issues = DEFAULT_ISSUES, withOrigin = true } = {}) {
  const dir = mkTempGitRepo('loop-', { withUser: true })
  git(dir, 'checkout', '-q', '-b', 'work')

  const bin = makeBin(dir)
  const jsonPath = join(dir, 'issues.json')
  writeFileSync(jsonPath, JSON.stringify(issues))
  writeClaudeStub(bin)
  writeGhStub(bin, jsonPath)

  mkdirSync(join(dir, 'scripts'))
  cpSync(join(ROOT, 'loop.sh'), join(dir, 'loop.sh'))
  cpSync(join(ROOT, 'loop-issues.sh'), join(dir, 'loop-issues.sh'))
  cpSync(join(ROOT, 'PROMPT_build.md'), join(dir, 'PROMPT_build.md'))
  cpSync(join(ROOT, 'PROMPT_review.md'), join(dir, 'PROMPT_review.md'))
  cpSync(join(ROOT, 'scripts', 'regen-board.mjs'), join(dir, 'scripts', 'regen-board.mjs'))
  cpSync(join(ROOT, 'scripts', 'review-triage.mjs'), join(dir, 'scripts', 'review-triage.mjs'))
  writeFileSync(join(dir, 'IMPLEMENTATION_PLAN.md'), '# board\n<!-- GH:BEGIN -->\n<!-- GH:END -->\n')
  // Mirror the real repo: .loop/ is gitignored, so the harness's own transient
  // writes never trip the dirty-tree guards (loop.sh checks after mkdir .loop;
  // loop-issues.sh logs before the inner run even starts).
  writeFileSync(join(dir, '.gitignore'), '.loop/\n')

  // Hermetic env: strip every loop.sh/stub knob inherited from the caller — an
  // agent iteration spawned by `ONLY=56 bash loop.sh` runs these tests with that
  // ONLY in its environment, which would steer the loop under test off the
  // sandbox board and fail 17 tests. Tests pass knobs explicitly via run().
  const KNOBS = [
    'ONLY', 'MODEL', 'BASE', 'AUTO_PR', 'AUTO_REVIEW', 'AUTO_MERGE', 'VERIFY_CMD',
    'REMEDIATION_ROUNDS', 'STALL_LIMIT', 'PUSH_FAIL_LIMIT', 'ITER_TIMEOUT', 'RETRIES',
    'BACKOFF', 'MAX_TURNS', 'ITERS_PER_ISSUE', 'CLAUDE_ACTION', 'CLAUDE_SLEEP', 'STUB_OBJECTIVE'
  ]
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  for (const k of KNOBS) delete env[k]
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
    gitLog: () => execFileSync('git', ['log', '--pretty=%s'], { cwd: dir, encoding: 'utf8' }),
    writeFile: (rel, content) => writeFileSync(join(dir, rel), content),
    commitAll: (msg) => {
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', msg)
    },
  }
}
