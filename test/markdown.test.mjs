import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdToHtml, htmlToMd, unwrapModelText } from '../src/main/markdown.js'

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

test('unwrapModelText strips a ```markdown wrapper always', () => {
  assert.equal(unwrapModelText('```markdown\n# Hi\n\n- a\n```'), '# Hi\n\n- a')
  assert.equal(unwrapModelText('```md\nhello\n```'), 'hello')
})

test('unwrapModelText strips a bare ``` wrapper only when allowBare', () => {
  assert.equal(unwrapModelText('```\nhello there\n```', { allowBare: true }), 'hello there')
  // Format path (allowBare false): a real single code block must be left intact.
  assert.equal(unwrapModelText('```\nconst x = 1\n```'), '```\nconst x = 1\n```')
  // A language-tagged code block is never a wrapper — left intact either way.
  assert.equal(unwrapModelText('```go\nx := 1\n```', { allowBare: true }), '```go\nx := 1\n```')
})

test('unwrapModelText strips a leading preamble line', () => {
  assert.equal(unwrapModelText("Here's the revised text:\n\n# Hi"), '# Hi')
  assert.equal(unwrapModelText('Sure! Here is the result:\nDone'), 'Done')
})

test('unwrapModelText leaves clean output and mid-content fences untouched', () => {
  assert.equal(unwrapModelText('# Real\n\n```go\nx := 1\n```'), '# Real\n\n```go\nx := 1\n```')
  assert.equal(unwrapModelText('just prose'), 'just prose')
})
