# Phase 2 — Hotkey v0 (permission-free)

The smallest useful version of the global hotkey, needing **no Accessibility
permission**. Flow:

> user copies text (⌘C) → presses the hotkey → popover appears at the cursor →
> picks an action → result is written to the clipboard → user pastes (⌘V).

No synthetic keystrokes, no AX, works in every app. It feeds the existing
`transform` pipeline unchanged — and because `transform` now resolves the provider
in main, the overlay sends only `{ text, action }` and knows nothing about providers.

Implements `hotkey-interaction.md`. Ground truth: the restructured repo
(`src/main`, `src/renderer/src`, `src/shared/tokens.js`, `@tokens` alias).

---

## Land it in two commits

**Commit 1 — `refactor: extract ActionPanel from App.jsx` (no behavior change).**
The in-app popover's inner card content is inline in `App.jsx` (~lines 417–555).
Lift it into `src/renderer/src/ActionPanel.jsx` — a presentational component, no
state of its own. The textarea, the badge, anchoring/positioning, and all state
**stay in `App.jsx`**; only the card *content* moves.

`ActionPanel` props:
```
providerLabel, actions, tones,
busy, error, result, marks, copied,
onAction(id), onTone(t), onCopy,
primary: { label, icon, onClick }   // in-app: Replace; hotkey: Copy
hint?                               // optional line under the result (hotkey uses it)
```
After extraction, `App.jsx` renders `<ActionPanel … primary={{label:'Replace', icon:CornerDownLeft, onClick:apply}} />` inside its floating popover. **Acceptance for
this commit: the in-app popover looks and behaves identically.** Ship it before touching anything else.

**Commit 2 — `feat: permission-free global hotkey (v0)`.** Everything below.

---

## New files

- `src/renderer/popover.html` — mirror of `index.html` (same CSP meta), loads `./src/popover.jsx`.
- `src/renderer/src/popover.jsx` — mounts `<HotkeyPopover/>` (StrictMode + createRoot, like `main.jsx`).
- `src/renderer/src/HotkeyPopover.jsx` — the hotkey container: captured-text preview + `<ActionPanel/>`.
- `src/main/overlay.js` — owns the single overlay window (create-once, show/hide).
- `src/main/hotkey.js` — registers the global shortcut, orchestrates grab → show.

## Changed files

- `electron.vite.config.mjs` — add the second renderer entry:
  ```js
  renderer: {
    resolve: { alias: { '@tokens': tokens } },
    server: { fs: { allow: [root] } },
    plugins: [react()],
    build: { rollupOptions: { input: {
      index:   resolve(root, 'src/renderer/index.html'),
      popover: resolve(root, 'src/renderer/popover.html')
    } } }
  }
  ```
- `src/main/index.js` — after `seedFromEnv()`: `registerHotkey()`; register the new IPC handlers (below). Unregister on quit.
- `src/preload/index.js` — add the overlay channels (below). Same preload is used by both windows.

---

## Overlay window (`overlay.js`)

Single reused instance, created lazily, hidden between uses.
```
new BrowserWindow({
  width: 340, height: 420, show: false,
  frame: false, transparent: true, hasShadow: false,   // shadow is drawn in CSS
  resizable: false, fullscreenable: false, skipTaskbar: true,
  alwaysOnTop: true,
  webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
})
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
win.on('blur', hideOverlay)                  // click into another app dismisses
```
- `showOverlayAtCursor(text)` — position near `screen.getCursorScreenPoint()`,
  offset down-right, clamp/flip inside `screen.getDisplayNearestPoint(pt).workArea`;
  load `popover.html` (dev: `${ELECTRON_RENDERER_URL}/popover.html`, prod:
  `loadFile('../renderer/popover.html')`); on ready, `webContents.send('popover:show', { text })`; show + focus.
- `hideOverlay()` — `win.hide()` (don't destroy; preserve the renderer).
- `resizeOverlay(w, h)` — `win.setContentSize(w, h)` so the transparent window hugs the card.

## Hotkey (`hotkey.js`)
```
globalShortcut.register("CommandOrControl+Shift+'", onFire)   // default; configurable later
```
- `onFire()`:
  - if the overlay is visible → `hideOverlay()` (toggle) and return.
  - if a Blue Pencil window is frontmost (`BrowserWindow.getFocusedWindow()`) → no-op (interaction spec edge case).
  - else `showOverlayAtCursor(clipboard.readText())`. **This `clipboard.readText()` is the v0 "grab" seam** — v1 replaces it with synth-⌘C + changeCount read.
- Unregister all on `will-quit`.

---

## IPC contract (new)

| Channel              | Dir            | Purpose                                              |
|----------------------|----------------|------------------------------------------------------|
| `popover:show`       | main → overlay | deliver `{ text }` captured on this invocation       |
| `popover:resize`     | overlay → main | `(w, h)` → `resizeOverlay` (from a ResizeObserver)   |
| `popover:dismiss`    | overlay → main | Escape pressed → `hideOverlay`                       |
| `clipboard:write`    | overlay → main | `(text)` → `clipboard.writeText` (the Copy action)   |

Preload additions:
```js
onPopoverShow:  (cb) => { const h=(_e,p)=>cb(p); ipcRenderer.on('popover:show',h);
                          return () => ipcRenderer.removeListener('popover:show',h) },
popoverResize:  (w,h) => ipcRenderer.send('popover:resize', w, h),
popoverDismiss: () => ipcRenderer.send('popover:dismiss'),
clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),
```
Reused unchanged by the overlay: `transform`, `getSettings`, `listProviders`, `onSettingsChanged`.

---

## HotkeyPopover behavior

- On mount: `onPopoverShow(({text}) => reset state, set captured=text)`; load `getSettings()` + `listProviders()` for the `Assistant · {provider}` title; subscribe `onSettingsChanged`.
- **Empty capture** (clipboard blank): show only — "Copy text (⌘C), then press ⌘⇧'." No action buttons. *(Note: this differs from the locked spec's "select text…" wording, which describes v1's auto-grab. v0 is copy-first, so the copy says copy.)*
- **Captured**: read-only preview of `captured`, clamped to ~3 lines with a fade + `N words`, then `<ActionPanel/>`.
- Actions → `window.api.transform({ text: captured, action })` (and `{action:'tone', tone}`). Unwrap the envelope (`{ok,result}` | `{ok:false,message}`); on `code === 'NO_KEY'` show "Add a key in Blue Pencil to get started."
- Result `primary` = **Copy**: `await window.api.clipboardWrite(result.text)`, then show the hint "Copied — press ⌘V in your app." Popover **stays open** (try another action). **This Copy is the v0 "deliver" seam** — v1 adds reactivate-prev-app + synth-⌘V here.
- Escape → `window.api.popoverDismiss()`.
- A `ResizeObserver` on the card → `window.api.popoverResize(width, height)`.

---

## Two seams to keep clean for v1
Isolate these so v1 is a localized change, not a rewrite:
1. **grab** — `clipboard.readText()` in `hotkey.js`. v1: synth ⌘C, watch pasteboard `changeCount`, read, having recorded the frontmost app.
2. **deliver** — `clipboardWrite` + Copy hint. v1: write clipboard, reactivate the recorded app, synth ⌘V, restore the prior clipboard, then dismiss.

Keep them as named functions with a single call site each.

---

## Acceptance
- Copy text in any app, press ⌘⇧' → popover appears at the cursor showing that text.
- Proofread/Improve/etc. return; result renders; **Copy** puts it on the clipboard; ⌘V in the source app works.
- Empty clipboard → the copy-first empty state, no action buttons.
- Escape, clicking another app (blur), and pressing the hotkey again each dismiss.
- The window hugs the card (no large invisible click area); shows over a fullscreen app.
- In-app popover still behaves exactly as before (the Commit 1 guarantee).
- No Accessibility prompt appears anywhere.

## Out of scope (v1+)
Synthetic ⌘C/⌘V, frontmost-app reactivation, clipboard save/restore, Accessibility
permission + its not-granted state, configurable hotkey, editable capture. None of
those touch the files above except the two named seams.
