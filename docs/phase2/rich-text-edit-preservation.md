# Rich-text — Slice 2: formatting survives an edit (Case 1)

Second slice of [rich-text-formatting.md](./rich-text-formatting.md), building on
[Slice 1](./rich-text-format-action.md). When you grab **already-formatted** text and
run an action, the formatting is preserved through the edit and pastes back intact.

The deliver half is already done — Slice 1's universal dual-write handles any
`markdown: true` result. Slice 2 adds the **grab** half (read the rich flavor, convert
HTML→Markdown) and makes the **existing actions** preserve Markdown.

**Out of scope:** rich paste *into* the main window's plain textarea (it stays a
plain editor); tables/images round-tripping; RTF-only sources (fall back to plain).

---

## Grab reads the rich flavor (`automation.js`, `markdown.js`)
After the synth-⌘C, a rich source populates the clipboard's **html** flavor. A new
helper reads the current clipboard as Markdown:

```
readClipboardSelection() -> { text, markdown }
  html = clipboard.readHTML()
  if html present:  { text: htmlToMd(html), markdown: true }
  else:             { text: clipboard.readText(), markdown: false }
```

- `htmlToMd(html)` is a new pure function in `markdown.js` using **turndown** (base
  config — bold, italic, inline/block code, lists, headings, blockquotes, links; the
  90%. No GFM plugin / tables / strikethrough this slice).
- `grabSelection()` returns `{ text, markdown }` (was a bare string) and threads the
  flag through. The **v0 path** (Accessibility off, manual ⌘C) uses the same helper on
  the current clipboard, so Case 1 works in both grab modes.

**Detection rule:** any non-empty html flavor → treat as Markdown. Plain selections
that carry trivial html convert to ~identical text and deliver harmlessly via the
dual-write, so a precise "does it contain formatting?" sniff isn't needed.

## Thread the flag to the popover
`showOverlayAtCursor(text, accessibility, markdown)` → the `popover:show` payload gains
`markdown`; `HotkeyPopover` stores it as `capturedMarkdown` (reset on each show).

## Actions become Markdown-aware (`transform.js`)
`transform` accepts `markdown` in its payload (was the input rich?).

- **improve / simplify / summarize / tone** — when `markdown`, append: *the input is
  Markdown; preserve its structure (bold, italics, lists, code, headings, blockquotes,
  links) and return Markdown.* Result carries `markdown: true`.
- **proofread** — when `markdown`, instruct it to **keep all Markdown formatting** and
  correct only spelling/grammar/punctuation. `corrected` stays Markdown; result carries
  `markdown: true`. The before/after change snippets may contain markdown markers
  (accepted).
- **format** — unchanged; always `markdown: true` regardless of input.

So a result is `markdown: true` when the action is Format **or** the input was rich.
When `markdown` is false, every action keeps today's plain behavior verbatim — this
slice adds a branch, it doesn't rewrite the existing prompts.

## Renderer (`HotkeyPopover.jsx`)
- `doAction` / `reTone` pass `markdown: capturedMarkdown` to `transform`.
- The **input preview** renders via `Markdown.jsx` (clamped) when `capturedMarkdown`,
  so you see the formatting you grabbed instead of raw `**`/`#`.
- The result already renders + delivers correctly via Slice 1 (the result's own
  `markdown` flag). The main window (`App.jsx`) types plain text, so it stays
  `markdown: false` — Case 1 doesn't apply there.

## Library
`turndown` (HTML→Markdown), used in the main process. It's CommonJS, so unlike
`marked` it externalizes cleanly (verify at build).

---

## Honest caveats
- **HTML→MD is lossy** for tables, images, and deeply nested structure — out of scope.
- **turndown escaping** — it backslash-escapes some literals (e.g. `1\.`); accepted.
- **RTF-only sources** (some native apps emit RTF but no html) fall back to plain
  text / `markdown: false` — RTF→MD is not supported this slice.
- **Round-trip** HTML→MD→HTML isn't byte-identical; structure survives, exact markup
  may differ.

## Acceptance
- Grab bold + list + inline code from Notes → **Improve** → preview shows the
  formatting preserved → paste back into Notes keeps bold/list/code.
- Grab formatted text from Slack → **Proofread** → corrections applied, formatting
  intact, pastes back formatted.
- A **plain** grab behaves exactly as today (plain in, plain out).
- The user's clipboard (all flavors) is intact afterward (already handled in Slice 1).

## Commit grouping (dependency order)
- **a.** `htmlToMd` (turndown) + unit tests (`markdown.js`)
- **b.** grab reads html→md + thread `markdown` flag (`automation.js`, `hotkey.js`,
  `overlay.js`, `preload`)
- **c.** Markdown-aware prompts for all actions (`transform.js`)
- **d.** renderer: pass the flag + render the input preview (`HotkeyPopover.jsx`)
