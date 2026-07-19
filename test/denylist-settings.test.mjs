import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// #60 F8: denylist editing UI in settings. The wiring spans preload → main IPC →
// renderer; assert the contract statically (same pattern as input-labels.test.mjs)
// so any half-broken rename across the stack goes red.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const preload = read('../src/preload/index.js')
const main = read('../src/main/index.js')
const app = read('../src/renderer/src/App.jsx')

test('preload bridge exposes both denylist channels', () => {
  assert.match(preload, /getDenylist:.*invoke\('settings:getDenylist'\)/)
  assert.match(preload, /setDenylist:.*invoke\('settings:setDenylist', list\)/)
})

test('main handles both denylist channels', () => {
  assert.match(main, /ipcMain\.handle\('settings:getDenylist'/)
  assert.match(main, /ipcMain\.handle\('settings:setDenylist'/)
})

test('main surfaces DEFAULT_DENYLIST as the read-only defaults view', () => {
  assert.match(main, /import \{ DEFAULT_DENYLIST \} from '\.\/field-qualify\.js'/)
  assert.match(main, /defaults: DEFAULT_DENYLIST/)
})

test('main setDenylist calls storage (add/remove takes effect)', () => {
  assert.match(main, /setDenylist\(Array\.isArray\(list\) \? list : \[\]\)/)
})

test('renderer wires the add and remove paths through the bridge', () => {
  assert.match(app, /window\.api\?\.getDenylist\?\.\(\)/)
  assert.match(app, /window\.api\?\.setDenylist\?\.\(\[\.\.\.denyUser, v\]\)/)
  assert.match(app, /window\.api\?\.setDenylist\?\.\(denyUser\.filter/)
})

test('add input has an id-associated label and accessible name', () => {
  assert.match(app, /<label htmlFor="deny-add"/)
  const input = app.slice(app.indexOf('id="deny-add"'))
  assert.match(input.slice(0, input.indexOf('/>')), /aria-label=/, 'deny-add input has no aria-label')
})

test('user entries render removable, defaults render read-only', () => {
  assert.match(app, /denyUser\.map/)
  assert.match(app, /aria-label=\{`Remove \$\{id\} from denylist`\}/)
  assert.match(app, /denyDefaults\.map/)
  // defaults must NOT get a remove control (R3 built-in floor)
  const defaultsBlock = app.slice(app.indexOf('denyDefaults.map'))
  assert.doesNotMatch(defaultsBlock.slice(0, 200), /removeDeny/)
})
