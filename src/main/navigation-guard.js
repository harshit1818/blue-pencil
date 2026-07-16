// App-wide navigation guard (#37). Pure logic, no electron imports, so it loads
// under plain `node --test` — index.js passes `app`/`shell` in.
//
// DOMPurify keeps ordinary <a href> links and both windows render model output
// as HTML, so a clicked link performs a top-level navigation with the preload
// bridge (window.api) still attached. Classify every navigation target:
//   'allow'    — the app's own pages (dev server origin, or file: under appRoot)
//   'external' — http/https elsewhere → hand to the system browser
//   'deny'     — everything else (javascript:, data:, custom schemes, garbage)

export function classifyNavigation(url, { devOrigin = null, appRoot = null } = {}) {
  let u
  try {
    u = new URL(url)
  } catch {
    return 'deny'
  }
  if (devOrigin) {
    try {
      if (u.origin === new URL(devOrigin).origin) return 'allow'
    } catch {
      /* bad devOrigin — fall through */
    }
  }
  if (u.protocol === 'file:') {
    if (!appRoot) return 'deny'
    const root = appRoot.endsWith('/') ? appRoot : appRoot + '/'
    return decodeURIComponent(u.pathname).startsWith(root) ? 'allow' : 'deny'
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') return 'external'
  return 'deny'
}

// Wire the guard onto every webContents the app ever creates (main window,
// overlay, and anything else) — one hook instead of per-window handlers.
export function installNavigationGuards(app, shell, opts) {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const action = classifyNavigation(url, opts)
      if (action === 'allow') return
      event.preventDefault()
      if (action === 'external') shell.openExternal(url)
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (classifyNavigation(url, opts) === 'external') shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}
