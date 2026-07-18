# Design Notes

Companion to DESIGN.md. This is the *why* and the guardrails — read before
changing anything visual. Tokens live in `src/shared/tokens.js`; never hardcode values
that exist there.

---

## Rationale — what's load-bearing

The look is grounded in one subject: the copyeditor's desk. That grounding is
the whole point, not decoration.

- **Ink on warm paper.** The writing surface should feel like paper, not a SaaS
  card. Serif body text reinforces "this is for reading and writing prose."
- **One accent: the blue pencil (`pencil`).** An editor marks in blue/red pencil.
  Blue is the interactive accent; red (`mark`) is *only* ever used for struck
  corrections. Do not introduce a third accent or a gradient.
- **The floating badge is the signature.** It is the single memorable element.
  Spend boldness there and keep everything around it quiet.
- **Mono for data, serif for prose, grotesk for controls.** Each face has one job.

---

## Anti-drift guardrails

AI design tends to collapse toward three defaults. This design is none of them —
keep it that way:

- Not warm-cream + high-contrast serif + terracotta accent.
- Not near-black + single acid-green/vermilion accent.
- Not broadsheet hairline-rule newspaper columns.

Also avoid: gradient hero blocks, big-number-with-small-label stat rows,
`01 / 02 / 03` numbered markers (the actions are not a sequence), drop shadows
on everything, and emoji in the UI.

---

## Mac-native rules

The prototype **fakes** the window chrome (the three colored dots and title bar)
purely for the in-chat demo. **Do not reproduce the fake chrome in the real app.**

- Use Electron's native title bar — `titleBarStyle: 'hiddenInset'` for the
  inset-traffic-light look, with the real OS controls, not painted circles.
- Respect system appearance: read `nativeTheme.shouldUseDarkColors` and switch
  the `color.light` / `color.dark` token set. Listen for changes.
- Window: sensible `minWidth`/`minHeight`, resizable, restore last size.
- Use the system serif/grotesk/mono stacks in `src/shared/tokens.js` — no webfont download.
- Consider window vibrancy (`vibrancy: 'under-window'`) only if it doesn't muddy
  the paper surface; test before keeping it.

---

## Microcopy

Copy is design material. Active voice, sentence case, no filler. An action keeps
its name through the whole flow.

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

Errors state what happened and how to fix it. They don't apologize and aren't vague.

---

## UI states (every action needs all four)

- **Idle** — actions tappable, no result shown.
- **Loading** — per-action spinner on the button that was pressed; others stay
  enabled-looking but the in-flight one shows progress. Don't block the whole panel.
- **Result** — shown in the popover with Replace + Copy. Proofread also shows the
  change list (`before → after`, struck red, replacement blue).
- **Error** — inline in the panel, mark-colored, with the recovery copy above.

---

## Quality floor (non-negotiable)

- Visible keyboard focus on badge and every action.
- `prefers-reduced-motion`: disable the pop animation.
- Contrast: body text and accents meet WCAG AA in both light and dark sets.
- Badge has an accessible label ("Open assistant" / "Close assistant").
- Popover dismisses on outside click and on Escape.
