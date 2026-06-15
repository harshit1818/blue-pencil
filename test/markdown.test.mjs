import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdToHtml } from '../src/main/markdown.js'

test('mdToHtml renders structure', () => {
  const html = mdToHtml('# Title\n\n**bold** and `code`\n\n- one\n- two')
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<code>code<\/code>/)
  assert.match(html, /<li>one<\/li>/)
})

test('mdToHtml escapes raw HTML in model output (the only main-side defense)', () => {
  const html = mdToHtml('Hello <script>alert(1)</script> <img src=x onerror=alert(2)>')
  assert.doesNotMatch(html, /<script/i) // no live tag
  assert.doesNotMatch(html, /<img/i) // escaped to inert text, not a real element
  assert.match(html, /&lt;script&gt;/)
})
