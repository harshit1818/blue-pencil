# Rich-text — Slice 1: the Format action (Case 2)

First slice of [rich-text-formatting.md](./rich-text-formatting.md). Ships **Case 2**
end to end — plain text in, the model adds Markdown structure, the popover renders
it, and it pastes into the frontmost app as **ready-to-go rich text** (no manual
re-formatting).

**Out of scope (next slice):** reading the rich clipboard flavor on grab and making
the *existing* actions Markdown-aware (Case 1); tables/images.

---

## The model speaks Markdown; the clipboard never sees it
The new **Format** action returns Markdown — the model's internal language. But the
Markdown source is **never** what lands in the paste target. At deliver time it is
rendered to HTML, and that rich text is what goes on the clipboard, so the target app
applies the formatting on paste with zero manual work.

## Format action (`transform.js`)
Instruction: add Markdown structure *without changing the wording* — keep related
sentences in one paragraph, lists only for genuine enumerations, inline code for
commands/identifiers/paths/env-vars, fenced blocks for multi-line code, no invented
headings. Returns `{ kind: 'rewrite', title: 'Format', text: <md>, markdown: true }`.

The `markdown: true` flag — not a `kind === 'format'` check — drives both rendering
and delivery. Next slice, the other actions set the same flag when they become
Markdown-aware; nothing in the deliver path changes.

## Universal dual-write (the deliver strategy)
There is **no per-app registry**. A Markdown result is always written as:

```
clipboard.write({ html: mdToHtml(md), text: md })
```

- **Rich editors** — Slack's default composer, Gmail, Notion, Mail, Notes, Word,
  Pages, browsers — read the `html` flavor and render the formatting on paste.
- **Plain-only targets** — terminals, Markdown-native editors — fall back to the
  `text` flavor and get readable Markdown.

One write covers both. (This corrects the original spec's per-app `mrkdwn`/`profile`
design: Slack's default composer renders pasted *rich text*, so writing HTML is
correct for Slack too — writing `*bold*` as plain text would show literal markup.)

**Fidelity edges (accepted for Slice 1):** Slack has no headings, so `##` degrades to
bold/plain on paste; fenced blocks paste as monospace without syntax highlighting.
The one real exception is users who enable Slack's "Format with markup" mode — a
future single override, not worth building now.

`mdToHtml` (`src/main/markdown.js`, pure) renders via `marked` with raw HTML
**escaped** (the renderer's `html` hook), so a stray `<script>` in model output
becomes inert text. This is the only main-side defense (no DOM/DOMPurify there), so
it is locked by a unit test.

## Grab seam (`automation.js`)
Snapshot **all present clipboard flavors** (text + html + rtf), not just text, and
restore only the present flavors in `finally` — otherwise writing an html flavor
leaves it stuck on the user's clipboard. (Images / app-specific flavors are not
covered; a copied image is lost during an action — accepted.)

## Deliver seam (`pasteBack(text, { markdown })`)
- `markdown: false` → today's behavior: `writeText(text)`.
- `markdown: true` → the universal dual-write above.
Then reactivate the source app, ⌘V, restore the original flavors. Copy-mode
(Accessibility off) uses the same dual-write.

## Preview that renders (`Markdown.jsx`, `ActionPanel.jsx`)
When `result.markdown`, the result pane renders Markdown → sanitized HTML
(`marked` + `dompurify`; `breaks:false` so soft newlines fold into paragraphs)
styled with the design tokens. Format is the 5th action in both hosts. In the
main window a Markdown result's primary action is **Copy** (rich) — the plain
editor can't render Markdown, so Replace would just dump raw `**`/`#` source.

## Acceptance
- Plain text → **Format** → structure shows in the rendered preview.
- The *same* result pastes as ready-to-go rich text into Slack, Gmail, Mail, Notes.
- A plain-only target (terminal) gets readable Markdown from the text fallback.
- `mdToHtml('<script>alert(1)</script>')` contains no live `<script>` (tested).
- The user's clipboard (all originally-present flavors) is intact after an action.
