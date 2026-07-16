import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { color } from '../src/shared/tokens.js'

const linear = (c) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return (
    0.2126 * linear(parseInt(f.slice(0, 2), 16)) +
    0.7152 * linear(parseInt(f.slice(2, 4), 16)) +
    0.0722 * linear(parseInt(f.slice(4, 6), 16))
  )
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

test('contrast formula matches the #29 reference values', () => {
  assert.equal(contrast('#ffffff', '#6ba4e6').toFixed(2), '2.60')
  assert.equal(contrast('#9b958a', '#16171b').toFixed(2), '6.02')
})

test('onPencil on pencil meets WCAG AA text contrast (4.5:1) in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const C = color[theme]
    assert.ok(C.onPencil, `${theme}.onPencil token missing`)
    const ratio = contrast(C.onPencil, C.pencil)
    assert.ok(ratio >= 4.5, `${theme} onPencil/pencil is ${ratio.toFixed(2)}:1`)
  }
})

test('paper on ink (badge open state) meets non-text contrast (3:1) in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const C = color[theme]
    const ratio = contrast(C.paper, C.ink)
    assert.ok(ratio >= 3, `${theme} paper/ink is ${ratio.toFixed(2)}:1`)
  }
})

test('no hardcoded #fff literals in renderer components', () => {
  const dir = new URL('../src/renderer/src/', import.meta.url)
  for (const file of readdirSync(dir)) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue
    const src = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(!/['"`]#fff(fff)?['"`]/i.test(src), `${file} hardcodes #fff — use a token`)
  }
})
