import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTrustedFrame, guardSensitiveIpc } from '../src/main/ipc-guard.js'

const opts = { devOrigin: 'http://localhost:5173', appRoot: '/app/out' }

const topFrame = (url) => ({ parent: null, url })

test('only the top frame of our own pages is trusted', () => {
  assert.equal(isTrustedFrame(topFrame('http://localhost:5173/popover.html'), opts), true)
  assert.equal(isTrustedFrame(topFrame('file:///app/out/renderer/index.html'), opts), true)
})

test('missing frames, iframes and foreign pages are not trusted', () => {
  assert.equal(isTrustedFrame(null, opts), false)
  assert.equal(isTrustedFrame(undefined, opts), false)
  assert.equal(isTrustedFrame({ parent: {}, url: 'http://localhost:5173/' }, opts), false)
  assert.equal(isTrustedFrame(topFrame('https://evil.example/'), opts), false)
  assert.equal(isTrustedFrame(topFrame('file:///etc/passwd'), opts), false)
  assert.equal(isTrustedFrame(topFrame('javascript:alert(1)'), opts), false)
})

function fakeWiring({ overlayVisible = true } = {}) {
  const handlers = {}
  const ipcMain = {
    handle: (channel, fn) => (handlers[channel] = fn),
    on: (channel, fn) => (handlers[channel] = fn)
  }
  const calls = []
  guardSensitiveIpc(ipcMain, opts, {
    setApiKey: (provider, key) => (calls.push(['setApiKey', provider, key]), 'stored'),
    pasteBack: async (text, o) => calls.push(['pasteBack', text, o]),
    hideOverlay: () => calls.push(['hideOverlay']),
    isOverlayVisible: () => overlayVisible,
    relaunchApp: () => calls.push(['relaunchApp'])
  })
  return { handlers, calls }
}

const trustedEvent = { senderFrame: topFrame('http://localhost:5173/index.html') }
const evilEvent = { senderFrame: topFrame('https://evil.example/') }

test('key:set only writes for a trusted sender', async () => {
  const { handlers, calls } = fakeWiring()
  assert.equal(handlers['key:set'](evilEvent, 'openai', 'sk-stolen'), false)
  assert.deepEqual(calls, [])
  assert.equal(handlers['key:set'](trustedEvent, 'openai', 'sk-real'), 'stored')
  assert.deepEqual(calls, [['setApiKey', 'openai', 'sk-real']])
})

test('pasteBack needs a trusted sender AND a visible overlay', async () => {
  const shown = fakeWiring({ overlayVisible: true })
  await shown.handlers['hotkey:pasteBack'](evilEvent, 'injected', false)
  assert.deepEqual(shown.calls, [])
  await shown.handlers['hotkey:pasteBack'](trustedEvent, 'result', true)
  assert.deepEqual(shown.calls, [
    ['pasteBack', 'result', { markdown: true }],
    ['hideOverlay']
  ])

  const hidden = fakeWiring({ overlayVisible: false })
  await hidden.handlers['hotkey:pasteBack'](trustedEvent, 'result', false)
  assert.deepEqual(hidden.calls, [])
})

test('relaunch only fires for a trusted sender', () => {
  const { handlers, calls } = fakeWiring()
  handlers['accessibility:relaunch'](evilEvent)
  assert.deepEqual(calls, [])
  handlers['accessibility:relaunch'](trustedEvent)
  assert.deepEqual(calls, [['relaunchApp']])
})
