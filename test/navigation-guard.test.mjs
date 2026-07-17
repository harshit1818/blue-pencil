import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNavigation, installNavigationGuards } from '../src/main/navigation-guard.js'

const opts = { devOrigin: 'http://localhost:5173', appRoot: '/app/out' }

test('remote http/https links go to the system browser, never the window', () => {
  assert.equal(classifyNavigation('https://evil.example/phish', opts), 'external')
  assert.equal(classifyNavigation('http://example.com', opts), 'external')
})

test('the dev server origin is allowed, lookalike hosts are not', () => {
  assert.equal(classifyNavigation('http://localhost:5173/popover.html', opts), 'allow')
  assert.equal(classifyNavigation('http://localhost.evil.com:5173/', opts), 'external')
  assert.equal(classifyNavigation('http://localhost:9999/', opts), 'external')
})

test('file: URLs are allowed only under the app root', () => {
  assert.equal(classifyNavigation('file:///app/out/renderer/index.html', opts), 'allow')
  assert.equal(classifyNavigation('file:///etc/passwd', opts), 'deny')
  assert.equal(classifyNavigation('file:///app/out/../../etc/passwd', opts), 'deny')
  assert.equal(classifyNavigation('file:///app/out-evil/x.html', opts), 'deny')
  assert.equal(classifyNavigation('file:///app/out/x.html', { devOrigin: null, appRoot: null }), 'deny')
})

test('script-ish and malformed URLs are denied outright', () => {
  assert.equal(classifyNavigation('javascript:alert(1)', opts), 'deny')
  assert.equal(classifyNavigation('data:text/html,<script>1</script>', opts), 'deny')
  assert.equal(classifyNavigation('not a url', opts), 'deny')
})

test('malformed percent-encoding in a file: path fails closed, not open', () => {
  // decodeURIComponent throws on these; an escaped throw would skip
  // preventDefault in the will-navigate listener and let the navigation through.
  assert.equal(classifyNavigation('file:///a%zz', opts), 'deny')
  assert.equal(classifyNavigation('file:///app/out/x%zz.html', opts), 'deny')
  assert.doesNotThrow(() => classifyNavigation('file:///%E0%A4%A', opts))
})

function fakeElectron() {
  const opened = []
  const contentsList = []
  const listeners = {}
  const app = {
    on(event, fn) {
      listeners[event] = fn
    },
    emitWebContentsCreated() {
      const handlers = {}
      const contents = {
        windowOpenHandler: null,
        on(event, fn) {
          handlers[event] = fn
        },
        setWindowOpenHandler(fn) {
          this.windowOpenHandler = fn
        },
        navigate(url) {
          let prevented = false
          handlers['will-navigate']({ preventDefault: () => (prevented = true) }, url)
          return prevented
        }
      }
      listeners['web-contents-created']({}, contents)
      contentsList.push(contents)
      return contents
    }
  }
  return { app, shell: { openExternal: (url) => opened.push(url) }, opened, contentsList }
}

test('every webContents gets a will-navigate guard (the #37 overlay gap)', () => {
  const { app, shell, opened } = fakeElectron()
  installNavigationGuards(app, shell, opts)
  const mainContents = app.emitWebContentsCreated()
  const overlayContents = app.emitWebContentsCreated()

  assert.equal(overlayContents.navigate('https://evil.example/'), true)
  assert.deepEqual(opened, ['https://evil.example/'])
  assert.equal(mainContents.navigate('http://localhost:5173/index.html'), false)
  assert.equal(overlayContents.navigate('javascript:alert(1)'), true)
  assert.deepEqual(opened, ['https://evil.example/']) // deny does not openExternal
})

test('window.open is denied everywhere; only http/https escape to the browser', () => {
  const { app, shell, opened } = fakeElectron()
  installNavigationGuards(app, shell, opts)
  const contents = app.emitWebContentsCreated()

  assert.deepEqual(contents.windowOpenHandler({ url: 'https://docs.example/' }), {
    action: 'deny'
  })
  assert.deepEqual(opened, ['https://docs.example/'])
  assert.deepEqual(contents.windowOpenHandler({ url: 'file:///etc/passwd' }), { action: 'deny' })
  assert.deepEqual(opened, ['https://docs.example/'])
})
