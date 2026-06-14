# Phase 2 — Hotkey Popover Interaction (locked)

The hotkey popover reuses the in-app popover's *look* and the same `transform`
pipeline, but its *behavior* is different because it floats over other apps with
no textarea beside it. This locks those behaviors. Where a decision has a real
tradeoff, it's marked **[locked, override-able]** — veto before build, not after.

---

## How it differs from the in-app popover

| Aspect            | In-app popover                     | Hotkey popover                                  |
|-------------------|------------------------------------|-------------------------------------------------|
| Anchor            | Bottom-right corner of the textarea| At the mouse cursor, screen-edge aware          |
| Subject text      | Live textarea content              | A grabbed selection (clipboard / AX)            |
| Subject editable? | Yes — it *is* the textarea         | No — read-only preview                          |
| Primary result act| **Replace** → writes the textarea  | **Copy** (v0) / **Paste back** (v1)             |
| Dismiss           | Outside-click, Escape              | Blur, Escape, hotkey-again, after paste-back    |
| Provider picker   | In the title bar                   | None — uses the app's active provider           |
| After delivery    | Stays open                         | Paste-back dismisses; Copy stays w/ confirmation|

---

## Locked decisions

### Position
Appears at `screen.getCursorScreenPoint()`, offset slightly down-right of the
cursor, and flips across the cursor if it would clip a screen edge. The exact
selection rectangle is Phase 3 (AX); cursor is the best anchor we have without it.
Shows over fullscreen apps (`visibleOnFullScreen`).

### Captured text
A **compact read-only preview** sits at the top: the grabbed text clamped to ~2–3
lines with a fade, plus a `12 words` count. The preview exists so the user can
confirm the right thing was captured *before* spending a model call — critical in
v1 where the ⌘C grab is invisible. **[locked, override-able]** Not editable in v1;
inline-editable capture is a documented fast-follow, deferred to keep this from
becoming a second editor.

### Actions & delivery
Same action set as in-app (Proofread, Improve, Simplify, Summarize, Tone). The
result's primary button is **permission-dependent**, decided at runtime:
- **No Accessibility (v0):** primary is **Copy**, with the hint "Copied — press ⌘V
  in your app." Popover stays open after Copy so another action can be tried.
- **Accessibility granted (v1):** primary is **Paste back**, which reactivates the
  source app, pastes, restores the clipboard, and **dismisses the popover**. Copy
  remains as a secondary button in both modes.

One result slot; each action replaces the previous result, as in-app.

### States (all required)
- **Empty (no selection)** — if the grab is empty, show *only*: "Select text, then
  press ⌘⇧'" (the active hotkey). No action buttons — there's nothing to act on.
- **Loading** — per-action spinner on the pressed button; others stay interactive-looking.
- **Result** — preview-of-source stays visible above; result below with Copy / Paste back.
- **Model error** — inline, mark-colored, the normalized copy from `providers.js`.
- **Accessibility not granted (v1 only)** — when a paste-back is attempted without
  permission: a small inline notice with an **Open Accessibility Settings** button
  (`systemPreferences` deep-link) and a fallback line: "Until then, use Copy + ⌘V."
  Never a dead end.

### Dismissal & focus
The overlay is a normal focusable `alwaysOnTop` window that takes focus on show
(so keyboard and clicks work). Dismiss on: **Escape**, **window blur** (clicking
into another app), **pressing the hotkey again** (toggle), and **after a successful
paste-back**. On dismiss, focus returns to the prior app (v1 reactivates it explicitly).

### Keyboard-first
It's a keyboard-summoned tool, so it's keyboard-operable end to end. On open, focus
the primary action so **Enter runs it** (Proofread by default). Tab / arrows move
between actions. Escape dismisses. **[locked, override-able]** Digit shortcuts
(1 Proofread, 2 Improve, 3 Simplify, 4 Summarize) included — cheap and high-value
for a power tool.

### Look
The same popover component and tokens — frameless, transparent window hosting a
solid `panel`-background card with the standard border, radius (`radius.lg`), and
`shadow.popover`. Fixed width ~340px, height fits content. Title row reads
`Assistant · {provider}` so the active provider is visible without a picker.

---

## Architectural consequence (must resolve before build)

The hotkey popover is a **separate window = separate renderer**. The active
provider/model currently lives in renderer `localStorage`, which the overlay
renderer cannot see. **Lock: provider + per-provider model selection move to a
main-process setting** (persisted under `userData`, exposed via IPC), so both the
main window and the overlay agree on what's active. The in-app picker writes to it;
the overlay reads it. This is a prerequisite, not a nicety.

---

## Deliberately deferred

- Editable captured text (fast-follow).
- Exact selection-rectangle anchoring (Phase 3 / AX).
- Per-invocation provider switching from the overlay (use the app; keep the overlay minimal).
- Edge case: hotkey fired while Blue Pencil itself is frontmost → no-op for now.

---

## "Locked" means
Position, captured-text-is-read-only, permission-dependent primary action, the five
states, dismissal rules, keyboard model, and the provider-in-main consequence are
settled. Build v0 against this; v1 adds paste-back + the Accessibility state without
changing any of the above.
