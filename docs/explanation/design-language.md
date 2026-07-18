# Design language

> Status: current · Updated: 2026-07-18

Tokens live in `src/shared/tokens.js` — never hardcode a value that exists
there. `test/tokens-contrast.test.mjs` bans hex/`rgb()` literals in the
renderer, so a raw color value will fail `npm run verify`.

## Rationale — what's load-bearing

The look is grounded in one subject: the copyeditor's desk. That grounding is
the whole point, not decoration.

- **Ink on warm paper.** The writing surface should feel like paper, not a
  SaaS card. Serif body text reinforces "this is for reading and writing
  prose."
- **One accent: the blue pencil (`pencil`).** An editor marks in blue/red
  pencil. Blue is the interactive accent; red (`mark`) is *only* ever used
  for struck corrections. Do not introduce a third accent or a gradient.
- **The floating badge is the signature.** It is the single memorable
  element. Spend boldness there and keep everything around it quiet.
- **Mono for data, serif for prose, grotesk for controls.** Each face has one
  job.

## Palette

| Token       | Hex       | Use                                  |
|-------------|-----------|--------------------------------------|
| ink         | `#16181d` | text, dark UI                        |
| paper       | `#faf8f3` | app background, writing surface tint |
| panel       | `#ffffff` | cards, popover, textarea             |
| line        | `#e7e2d6` | borders, dividers                    |
| muted       | `#6f6a5f` | captions, secondary text             |
| pencil      | `#1f5fa8` | primary accent (the blue pencil)     |
| pencilSoft  | `#eaf1fa` | active fills, applied-change tint    |
| mark        | `#c2453d` | corrections only (struck text)       |
| markSoft    | `#fbecea` | correction background                |

Both a light and dark set exist in `src/shared/tokens.js`
(`color.light` / `color.dark`); the app reads `nativeTheme.shouldUseDarkColors`
and switches, listening for OS-level changes.

**Type**

- Display / writing surface: serif stack — `"Iowan Old Style", Palatino, Georgia, serif`
- UI: grotesk — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
- Labels / counts: mono — `ui-monospace, "SF Mono", Menlo, monospace`

System stacks only — no webfont download.

## Anti-drift guardrails

AI design tends to collapse toward three defaults. This design is none of
them — keep it that way:

- Not warm-cream + high-contrast serif + terracotta accent.
- Not near-black + single acid-green/vermilion accent.
- Not broadsheet hairline-rule newspaper columns.

Also avoid: gradient hero blocks, big-number-with-small-label stat rows,
`01 / 02 / 03` numbered markers (the actions are not a sequence), drop shadows
on everything, and emoji in the UI.

## Mac-native rules

The original prototype fakes window chrome (three colored dots, a title bar)
purely for its in-chat demo. **The real app never reproduces the fake
chrome:**

- Native title bar — `titleBarStyle: 'hiddenInset'` for the inset-traffic-light
  look, real OS controls, not painted circles.
- Window: sensible `minWidth`/`minHeight`, resizable, restores last
  size/position (`window-bounds.json` under `userData`).
- Window vibrancy (`vibrancy: 'under-window'`) is a "consider it, test before
  keeping it" call, not a commitment — only if it doesn't muddy the paper
  surface.

## Microcopy

Copy is design material. Active voice, sentence case, no filler. An action
keeps its name through the whole flow.

| Element              | Text                                  |
|----------------------|---------------------------------------|
| Badge (closed)       | (pencil icon, no label)               |
| Quick actions        | Proofread · Improve · Simplify · Summarize · Paraphrase · Neutralize · Formalize · Coherence · Format |
| Tone row             | Professional · Confident · Friendly · Concise |
| Apply result         | **Replace** (not "Submit"/"Apply changes") |
| Copy result          | Copy → Copied (transient)             |
| Empty result         | —                                     |
| Clean proofread      | "Clean — nothing to fix."             |
| Error                | "Couldn't reach the model. Check your key in Settings and try again." |

Errors state what happened and how to fix it. They don't apologize and aren't
vague.

## UI states (every action needs all four)

- **Idle** — actions tappable, no result shown.
- **Loading** — per-action spinner on the button that was pressed; others
  stay enabled-looking but the in-flight one shows progress. Don't block the
  whole panel.
- **Result** — shown in the popover with Replace + Copy. Proofread also shows
  the change list (`before → after`, struck red, replacement blue).
- **Error** — inline in the panel, mark-colored, with the recovery copy above.

## Quality floor (non-negotiable)

- Visible keyboard focus on badge and every action.
- `prefers-reduced-motion`: disable the pop animation.
- Contrast: body text and accents meet WCAG AA in both light and dark sets
  (`test/tokens-contrast.test.mjs` enforces this).
- Badge has an accessible label ("Open assistant" / "Close assistant").
- Popover dismisses on outside click and on Escape.
