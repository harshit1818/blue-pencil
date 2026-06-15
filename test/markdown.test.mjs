import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdToHtml, mdToSlack } from '../src/main/markdown.js'
import { profileFor } from '../src/main/profiles.js'

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

test('mdToSlack maps inline markup', () => {
  assert.equal(mdToSlack('**bold**'), '*bold*')
  assert.equal(mdToSlack('_italic_'), '_italic_')
  assert.equal(mdToSlack('*italic*'), '_italic_')
  assert.equal(mdToSlack('~~gone~~'), '~gone~')
  assert.equal(mdToSlack('[Rimo](https://rimo.app)'), '<https://rimo.app|Rimo>')
})

test('mdToSlack maps block structure', () => {
  assert.equal(mdToSlack('# Heading'), '*Heading*')
  assert.equal(mdToSlack('- item'), '• item')
  assert.equal(mdToSlack('1. first'), '1. first')
  assert.equal(mdToSlack('> quote'), '> quote')
})

test('mdToSlack leaves code spans and fences untouched', () => {
  assert.equal(mdToSlack('use `**not bold**` here'), 'use `**not bold**` here')
  assert.equal(mdToSlack('```\n**verbatim**\n```'), '```\n**verbatim**\n```')
})

test('profileFor resolves strategy with sane default', () => {
  assert.equal(profileFor('com.tinyspeck.slackmacgap'), 'mrkdwn')
  assert.equal(profileFor('com.apple.mail'), 'rich')
  assert.equal(profileFor('md.obsidian'), 'plain')
  assert.equal(profileFor(null, 'Slack'), 'mrkdwn')
  assert.equal(profileFor('com.unknown.app', 'Whatever'), 'rich')
})
