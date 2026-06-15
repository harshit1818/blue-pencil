# Rich-text Formatting

Two problems, one root cause: the pipeline is **plain text end to end**. Grab is
`clipboard.readText()` (a rich selection is already flattened here); deliver is
`writeText` + ⌘V (can't emit formatting). So:
- **Case 1** — formatted input → formatting lost (flattened at grab).
- **Case 2** — plain input → can't gain formatting (can't write it at deliver).

Fix both by making the *edges* format-aware and giving the model a format it speaks.

---

## Core idea — Markdown is the model's language
Markdown is the interchange format. The model always receives and returns Markdown:
it's fluent in it and treats `**bold**`, `- lists`, fenced code as real structure.

- **Grab:** read the richest flavor — prefer `clipboard.readHTML()`, fall back to
  `readText()`. HTML → Markdown via **turndown**. Plain text stays plain. (After the
  synth-⌘C, rich sources populate the HTML flavor too, so this slots into the
  existing grab seam.)
- **Model:** edits the Markdown (Case 1, formatting survives) or *adds* Markdown
  (Case 2, via a new **Format** action).
- **Deliver:** convert Markdown to the **target app's** format (below) and write the
  right clipboard flavor(s), then ⌘V.

---

## The crux — target-aware delivery
The naive "just write HTML" breaks Slack; "just write Markdown text" breaks Gmail.
Different targets want different things, so pick a strategy from the **frontmost app
you already capture in v1's grab** (its bundle id).

1. **Rich-clipboard (HTML)** — Gmail, Notion, Mail, Word, Pages, generic rich editors.
   Markdown → HTML (**marked**/markdown-it), `clipboard.write({ html, text })`, ⌘V.
   The app renders the HTML; the plain `text` is the fallback.
2. **Markup-as-plain-text** — Slack, Discord, WhatsApp, Markdown editors, terminals.
   Markdown → that app's text markup, written as **plain text**; the app renders it.
   - *Your Slack example:* `**bold**` → `*bold*`, keep ``` fences and `` `inline` ``,
     bullets → `• `. Write it as plain text and Slack renders it on input. **Do not
     write HTML to Slack.**
3. **Unknown / plain target** — write `{ html, text: <markdown source> }`: rich apps
   take the HTML, everything else gets readable Markdown (no literal `**` soup).

A small **profile registry**: `bundleId → 'rich' | 'mrkdwn' | 'discord' | 'plain'`.
Seed it with the apps you actually use. Browsers can't reveal which *web app* is
focused, so browser bundle ids default to `rich` (Gmail/Notion web accept HTML paste).

---

## New action — Format (Case 2)
Instruction: *identify the appropriate structure and apply Markdown formatting
(headings, bold, bullet/numbered lists, fenced code blocks for code, inline code for
identifiers, blockquotes) **without changing the wording**.* Returns Markdown.

## Preview that renders
The result pane renders the Markdown to styled HTML (sanitized, using the design
tokens) so you **see** the bold/bullets/code before delivering — the "it renders and
gives the correct formatted text" you described.

---

## Where it touches the code (same two seams + a little)
- **grab seam:** also `readHTML()` → turndown → Markdown.
- **deliver seam:** Markdown → target format (registry-driven) → multi-flavor write.
- **+ Format action** in the action set.
- **+ Markdown→styled-HTML render** in the result pane.
- **+ per-app profile map** (new small module).

## Libraries (all pure JS)
`turndown` (HTML→MD), `marked` or `markdown-it` (MD→HTML), `dompurify` (sanitize),
plus a ~50-line MD→Slack-mrkdwn converter (bold/italic/strike/code/lists/quote).

---

## Honest caveats
- **Per-app fidelity is a long tail.** Slack, Gmail, and Notion each have paste
  quirks. Start with the 2–3 apps you use; let the rest degrade to plain/generic HTML.
- **Browsers hide the focused web app** — `rich` default is the pragmatic call.
- **Clipboard save/restore must now snapshot *all* flavors** (text + html + rtf), not
  just text, or you degrade the user's clipboard on every action.
- **Prefer HTML source over RTF** (RTF→MD is lossy); some native apps only put RTF —
  accept the lossy path or skip.
- **Sanitize** HTML before rendering in the preview and before writing to the clipboard.

## Acceptance
- A formatted Slack message → action → pastes back into Slack with `*bold*`/code/bullets intact.
- Rough plain text → **Format** → structure shows in the rendered preview → pastes into
  Gmail as rich text and into Slack as mrkdwn from the *same* result.
- A plain-only target → clean readable output, never literal `**`.
- Your clipboard (all flavors) is intact afterward.

## Out of scope
Perfect fidelity for every app; tables/images round-tripping (start with bold, italic,
code, lists, headings, quotes — the 90%).
