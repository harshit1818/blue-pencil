import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdToHtml, htmlToMd } from '../src/main/markdown.js'

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

test('htmlToMd converts a rich selection to Markdown', () => {
  assert.equal(htmlToMd('<strong>bold</strong>'), '**bold**')
  assert.equal(htmlToMd('<em>italic</em>'), '*italic*')
  assert.equal(htmlToMd('<code>npm install</code>'), '`npm install`')
  assert.equal(htmlToMd('<h2>Setup</h2>'), '## Setup')
  assert.equal(htmlToMd('<a href="https://rimo.app">Rimo</a>'), '[Rimo](https://rimo.app)')
  assert.match(htmlToMd('<ul><li>one</li><li>two</li></ul>'), /^-\s+one\n-\s+two$/)
  assert.match(htmlToMd('<blockquote>quote</blockquote>'), /^>\s*quote$/)
})

test('htmlToMd returns empty for empty/absent html (plain-only grab)', () => {
  assert.equal(htmlToMd(''), '')
  assert.equal(htmlToMd(null), '')
})
