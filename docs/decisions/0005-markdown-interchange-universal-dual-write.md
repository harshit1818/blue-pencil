# 0005 — Markdown as interchange format; universal dual-write on delivery

> Status: Accepted · Updated: 2026-07-19

## Context

The hotkey pipeline was plain text end to end: grab was `clipboard.readText()`
(flattening any rich selection before the model ever saw it) and deliver was
`writeText()` + ⌘V (unable to emit formatting). Formatted input lost its
formatting through an action, and plain input couldn't gain formatting even
when the model added structure. Different paste targets also expect different
clipboard contents — a naive "always write HTML" breaks apps that don't
render pasted HTML as rich text; "always write Markdown as plain text" pastes
literal `**bold**` into apps that would have rendered it.

## Decision

Markdown is the model's interchange format for both directions. Grab reads
the richest clipboard flavor available (HTML → Markdown via turndown, else
plain text) and deliver renders any Markdown result to HTML and writes both
flavors at once — a **universal dual-write**, `clipboard.write({ html, text })`
— with no per-app branching.

Verified against shipped code:
- `src/main/markdown.js` — `mdToHtml`/`mdToClipboardHtml` (marked, raw HTML
  escaped via a renderer hook, locked by a unit test) and `htmlToMd`
  (turndown, base config: bold/italic/code/lists/headings/blockquotes/links).
- `src/main/automation.js` — `readClipboardSelection()` (grab: html→md when
  present), `writeResult()` (deliver: `clipboard.write({ html, text })` when
  `markdown: true`, `writeText()` otherwise) — one function, no bundle-id
  lookup, no per-app profile table anywhere in the module.

## Consequences

- Rich editors (Gmail, Notion, Slack's default composer, Mail, Notes, Word)
  read the `html` flavor and render the formatting on paste; plain-only
  targets (terminals, Markdown-native editors) fall back to the readable
  Markdown `text` flavor. One write serves both.
- Accepted fidelity edges: Slack has no heading concept, so
  `mdToClipboardHtml` downgrades `##` to a bold paragraph before delivery;
  fenced code blocks paste as monospace with no syntax highlighting.
- Because there's no DOM/DOMPurify available in the main process, raw HTML in
  model output is neutralized by *escaping* it in the Markdown renderer hook
  rather than sanitizing a parsed tree — the only defense, and it's covered by
  a test.

## Alternatives considered

A per-app **bundle-id → format profile registry** (`rich` / `mrkdwn` /
`discord` / `plain`) with a hand-written Markdown→Slack-mrkdwn converter —
this was the *original* design (`rich-text-formatting.md`). It was reversed
by its own child spec (`rich-text-format-action.md`, "Slice 1") before it
shipped: Slack's default composer renders **pasted rich text**, so writing
`*bold*` as plain text would show up as literal asterisks — the opposite of
the intended effect. The universal dual-write gets Slack (and everything
else) right with no per-app maintenance surface. The shipped code confirms
only the dual-write path exists; no profile registry was ever built.
