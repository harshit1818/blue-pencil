import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// #33: `transition: all` cross-fades every property on a theme flip, shimmering
// the whole UI. The pill factories must name the properties they actually
// animate (border-color, background, color). Static contract, same pattern as
// the #fff ban in tokens-contrast.test.mjs — goes red if `all` returns.

const files = ['../src/renderer/src/App.jsx', '../src/renderer/src/ActionPanel.jsx']

for (const rel of files) {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8')

  test(`${rel} pill has no 'transition: all'`, () => {
    assert.doesNotMatch(src, /transition:\s*'all/, 'pill uses transition: all — name the properties instead')
  })

  test(`${rel} pill names border-color, background and color`, () => {
    assert.match(src, /transition:\s*'border-color[^']*background[^']*color[^']*'/)
  })
}
