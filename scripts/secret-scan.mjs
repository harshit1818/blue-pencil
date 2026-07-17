// Secret scan run by `npm run verify` — blocks a commit that would leak a key.
// ponytail: regex scan of would-be-committed files, swap in gitleaks if patterns fall short
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const PATTERNS = [
  { name: 'API key (sk-...)', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
]

export function scan(text) {
  const findings = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of PATTERNS) {
      if (re.test(lines[i])) findings.push({ name, line: i + 1 })
    }
  }
  return findings
}

function main() {
  // Everything a `git add -A` would commit: tracked + untracked-not-ignored.
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8'
  })
  let found = 0
  for (const file of out.split('\0').filter(Boolean)) {
    let text
    try {
      if (statSync(file).size > 1024 * 1024) continue
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\0')) continue
    for (const { name, line } of scan(text)) {
      console.error(`${file}:${line} — possible ${name}`)
      found++
    }
  }
  if (found) {
    console.error(`secret-scan: ${found} possible secret(s) — fix or remove before committing`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
