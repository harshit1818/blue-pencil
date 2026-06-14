# Phase 2 — Global Hotkey

Bring Blue Pencil to text anywhere on the Mac without the Phase 3 overlay.
The pragmatic 80%: **select text in any app → hotkey → popover → pick an action →
result goes back.** Works in Slack and Chrome (where AX write-back doesn't),
because clipboard paste is universal.

The core is unchanged. This is a new entry path that feeds the existing
`transform` → `providers` → Keychain pipeline. Nothing in `transform.js`,
`providers.js`, or `keychain.js` changes.

---

## Staging — ship the permission-free version first

**v0 — zero permissions (a day).**
User copies the text themselves (⌘C), presses the hotkey, the popover appears at
the cursor with the action buttons, picks one, the result is written to the
clipboard, user pastes it (⌘V). No synthetic keystrokes, so **no Accessibility
permission** and it works literally everywhere. Costs the user two manual
keystrokes. Ship this, feel it, then decide if the auto-grab/auto-paste is worth
the permission prompt.

**v1 — Accessibility (the "select → hotkey → done" experience).**
On hotkey: synthesize ⌘C to grab the selection automatically; after the action,
re-activate the previous app and synthesize ⌘V to paste back. Removes the two
manual keystrokes. Requires Accessibility permission and careful sequencing
(below). Build on top of v0 — same UI, same pipeline.

---

## Architecture — where it slots

New, additive:

- **`src/main/hotkey.js`** — registers the global shortcut, orchestrates the flow:
  grab → show popover → (popover calls the existing `transform` IPC) → deliver result.
- **`src/main/overlay.js`** — a small frameless, transparent, `alwaysOnTop` popover
  window shown near the cursor. Reuses the renderer's popover component via a
  popover-only render mode (e.g. `?mode=popover`), so the UI isn't duplicated.
- **`src/main/clipboard-paste.js`** (v1 only) — clipboard save/restore + synthetic
  ⌘C/⌘V + previous-app reactivation, via `osascript` (no native addon needed to start).

Unchanged and reused: `transform.js`, `providers.js`, `keychain.js`, `preload`,
the popover React component.

```
hotkey fires
  → grab selected text  (v0: read clipboard | v1: synth ⌘C then read)
  → show overlay popover near cursor, seeded with the text
  → user picks action → window.api.transform(...)   ← EXISTING pipeline
  → show result in popover
  → deliver: write result to clipboard
       (v0: user ⌘V | v1: reactivate prev app, synth ⌘V, restore clipboard)
```

---

## Mechanics & the two racy bits

**Global shortcut.** Electron `globalShortcut.register('CommandOrControl+Shift+\'', …)`
after `app.whenReady()`; `unregisterAll()` on quit. Standard accelerator combos do
**not** need Accessibility. Pick a default unlikely to clash; make it configurable later.

**Popover position.** Getting the exact selection rectangle needs AX (Phase 3).
For now, place the window at `screen.getCursorScreenPoint()`. Call
`win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` so it shows
over fullscreen apps.

**Racy bit 1 — reading the copy (v1).** After synthesizing ⌘C the copy is async;
a fixed delay is a guess. Instead, read `clipboard` change detection: record the
pasteboard `changeCount` before, poll until it increments (cap ~500ms), then read.
Deterministic, no magic sleep.

**Racy bit 2 — pasting back (v1).** Showing the popover moves focus to Blue Pencil.
To paste into Slack you must **re-activate the previously-frontmost app before ⌘V.**
So capture the frontmost app when the hotkey fires (`osascript` can read and later
`activate` it), close the popover, reactivate that app, then synth ⌘V.

**Clipboard hygiene (v1).** Synthetic ⌘C/⌘V clobber the user's clipboard. Save the
existing clipboard text first and restore it after pasting. (Plain text only to
start; preserving rich/image pasteboard contents is harder and can wait.)

---

## Permissions

- v0: none.
- v1: **Accessibility** (System Settings → Privacy & Security → Accessibility) —
  required to post synthetic keystrokes via `osascript`/System Events. Prompt lazily
  on first hotkey use: `systemPreferences.isTrustedAccessibilityClient(true)` triggers
  the system prompt; guide the user if not yet trusted. Degrade to v0 behavior
  (manual ⌘C/⌘V) until granted, rather than failing.
- Run as an accessory app (no Dock icon) only if/when you want it to feel like a
  background utility — optional for Phase 2.

---

## Gotchas

- Secure input fields (password fields) block synthetic events — expected; don't
  operate there.
- A few apps mishandle standard ⌘C/⌘V — accept as known limits, don't special-case.
- `osascript` keeps Phase 2 native-addon-free; a native module is a later
  reliability upgrade, not a prerequisite.

---

## Out of scope (still Phase 3)

Per-field corner badge, persistent tracking, AX read/write, live observers,
the non-activating overlay. The hotkey deliberately trades the always-there badge
for "summon on demand" so it ships in days without the native AX work.
