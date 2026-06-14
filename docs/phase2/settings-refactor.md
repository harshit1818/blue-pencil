# Phase 2 Prerequisite — Provider/Model to Main

Move the active provider and per-provider model from renderer `localStorage` into
a main-process settings store, exposed over IPC and broadcast to all windows. This
is a standalone refactor: **no hotkey code, no behavior change the user can see** —
the in-app picker works exactly as before, just backed by main instead of
`localStorage`. It exists so the future overlay window (a separate renderer) reads
the same source of truth.

Land it as its own commit: `refactor: move provider/model selection into main`.

---

## Why

The hotkey popover is a separate window = separate renderer. `localStorage` is
per-renderer, so the overlay can't see a choice made in the main window. One
authority in main fixes that and removes the whole desync bug class.

**Settings hold no secrets.** API keys stay in the Keychain. `settings.json` holds
only the provider id and model strings. State this in a comment so no one is
tempted to "simplify" by putting keys there.

---

## Module changes

### New: `src/main/settings.js` — persistence only
A small JSON-file store under `userData`, mirroring the existing `window-bounds`
pattern in `index.js`. Loaded once into memory on startup; written on change
(prefer write-temp-then-rename for atomicity).

Raw shape (no defaults applied here — this module is dumb storage):
```js
// { provider: string | null, models: { [providerId]: string } }
export function getSettings()                 // → the raw object (or {provider:null, models:{}})
export function setProviderId(id)             // persists, returns updated raw object
export function setModelId(providerId, model) // trims; persists; returns updated raw object
```

### `src/main/providers.js` — gains the resolvers (it owns the registry)
Defaults live with the registry, so resolution lives here, not in `settings.js`.
```js
// Effective active selection for a model call — validated against REGISTRY.
// Falls back to the first provider / the provider's defaultModel when stored
// values are missing or stale.
export function resolveActive()        // → { provider, model }

// A renderer-facing view: the effective active provider id, plus an effective
// model string for every registry provider (stored value or defaultModel).
export function effectiveSettings()    // → { provider, models: { [id]: string } }
```
`resolveActive()` and `effectiveSettings()` both read `getSettings()` and reconcile
against `REGISTRY`. Import direction is `providers → settings` only (no cycle).

### `src/main/transform.js` — stop trusting the renderer for provider/model
**Signature change.** The payload no longer carries `provider`/`model`; transform
resolves them itself, so a window can request a transform knowing only the action.
```js
// before: transform({ text, action, tone, provider, model })
// after:  transform({ text, action, tone })
const { provider, model } = resolveActive()   // from providers.js
```
This is the decision that makes the overlay trivially correct — it sends an action
and nothing else.

### `src/main/index.js` — IPC handlers + cross-window broadcast
Add handlers:
```
settings:get          → effectiveSettings()
settings:setProvider  → (id) validate ∈ registry, setProviderId(id), broadcast, return effectiveSettings()
settings:setModel     → (id, model) setModelId(id, model), broadcast, return effectiveSettings()
```
`settings:setProvider` rejects ids not in the registry (don't persist garbage).

**Broadcast (build the seam now, even with one window):** after any settings write,
push to every renderer so windows stay live in sync:
```js
for (const w of BrowserWindow.getAllWindows())
  w.webContents.send('settings:changed', effectiveSettings())
```
The overlay later just subscribes; nothing else to add when it arrives.

### `src/preload/index.js` — expose settings + the change subscription
```js
getSettings:        () => ipcRenderer.invoke('settings:get'),
setProvider:        (id) => ipcRenderer.invoke('settings:setProvider', id),
setModel:           (id, model) => ipcRenderer.invoke('settings:setModel', id, model),
onSettingsChanged:  (cb) => {
  const h = (_e, s) => cb(s)
  ipcRenderer.on('settings:changed', h)
  return () => ipcRenderer.removeListener('settings:changed', h)
}
```
Keep `transform`, `listProviders`, `hasKey`, `setKey` as-is.

### `src/renderer/src/App.jsx` — read/write via IPC, drop localStorage
- **Remove** all `localStorage` use for `bp.provider` and `bp.model.*`.
- **On mount:** call `listProviders()` (for labels/defaults, unchanged) *and*
  `getSettings()` to seed `provider` + `models` state. Subscribe via
  `onSettingsChanged(setFromSnapshot)`; unsubscribe on unmount.
- **Provider `<select>` onChange** → `window.api.setProvider(id)`. Don't hand-set
  local state; let the `settings:changed` echo update it (single path, no drift).
- **Model `<input>` onChange** → `window.api.setModel(provider, value)`. (Debounce
  the write if it feels chatty per keystroke — optional.)
- **`transform` calls drop `provider`/`model`** from the payload:
  `transform({ text, action })` and `transform({ text, action: 'tone', tone })`.
- The `key:has` check on provider change is unchanged; `provider` now comes from
  settings state rather than `localStorage`.

---

## One-time migration (optional, renderer-side, low effort)
Main can't read renderer `localStorage`. So on first mount, if `getSettings()`
returns the empty default *and* old `localStorage` keys exist, seed them up via
`setProvider`/`setModel` once, then delete the `localStorage` keys. It's your own
data on one machine, so skipping migration (accept defaults once) is also fine —
mark it optional and don't over-invest.

---

## Acceptance
- Pick a provider and edit a model in the app, quit, relaunch → both persist (now
  from `settings.json`, confirm the file appears under `userData` and contains
  **no key material**).
- `transform` works with the new shorter payload; main resolves provider/model.
- A stale/edited `settings.json` (unknown provider id) → app falls back to the
  first provider instead of erroring.
- (Seam check, no overlay yet) Changing the provider dispatches `settings:changed`;
  the single window updates from the broadcast, not from a direct local set.

## Out of scope
The overlay window, the hotkey, anything in `hotkey-interaction.md`. This
commit only relocates state and builds the broadcast seam.
