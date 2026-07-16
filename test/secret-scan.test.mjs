import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scan } from '../scripts/secret-scan.mjs'

// Fixture secrets are concatenated so this file never contains one literally.
const fake = (prefix, body) => prefix + body

test('scan detects common key shapes with line numbers', () => {
  const text = [
    'hello world',
    'key = ' + fake('sk-', 'ant-api03-' + 'a'.repeat(24)),
    'aws = ' + fake('AKIA', 'ABCDEFGHIJKLMNOP'),
    'gh = ' + fake('ghp_', 'a1B2'.repeat(10)),
    'goog = ' + fake('AIza', 'a'.repeat(35)),
    'slack = ' + fake('xoxb-', '1234567890-abc'),
    fake('-----BEGIN ', 'RSA PRIVATE KEY-----')
  ].join('\n')
  const lines = scan(text).map(f => f.line)
  assert.deepEqual(lines, [2, 3, 4, 5, 6, 7])
})

test('scan passes clean prose and code', () => {
  assert.deepEqual(scan('const risk = compute()\n// ask the user for a key at runtime\n'), [])
  assert.deepEqual(scan('sha512-aBcDeF+gHiJkLmNoP/qRsTuVwXyZ0123456789=='), [])
})

const script = fileURLToPath(new URL('../scripts/secret-scan.mjs', import.meta.url))

const gitRepo = files => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

test('CLI blocks a repo containing a secret', () => {
  const dir = gitRepo({ 'leak.txt': 'token: ' + fake('sk-', 'ant-' + 'a'.repeat(30)) + '\n' })
  const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /leak\.txt:1/)
})

test('CLI passes a clean repo', () => {
  const dir = gitRepo({ 'ok.txt': 'nothing to see here\n' })
  const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0)
})
