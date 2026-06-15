# Rich-text — Slice 1: the Format action (Case 2)

First slice of [rich-text-formatting.md](./rich-text-formatting.md). Ships **Case 2**
end to end — plain text in, the model adds Markdown structure, the popover renders
it, and it pastes into the frontmost app in *that app's* format. This slice also
builds the shared delivery plumbing (all-flavor clipboard handling, target-aware
deliver, the profile registry) that Case 1 will reuse.

**Out of scope (next slice):** reading the rich clipboard flavor on grab and making
the *existing* actions Markdown-aware (Case 1); tables/images.

---

## The model speaks Markdown
The new **Format** action returns Markdown. The model never sees or emits HTML. The
renderer renders that Markdown for preview; main converts it to the target app's
format only at deliver time.

## Format action (`transform.js`)
Instruction: *identify the appropriate structure and apply Markdown formatting —
headings, bold, bullet/numbered lists, fenced code for code, inline code for
identifiers, blockquotes — **without changing the wording**. Return ONLY Markdown.*
Returns `{ kind: 'rewrite', title: 'Format', text: <md>, markdown: true }`.

The `markdown: true` flag — not a `kind === 'format'` check — is what drives both
rendering and delivery. Next slice, the other actions set the same flag when they
become Markdown-aware; nothing in the deliver path changes.

## Converters (`src/main/markdown.js`, pure)
- `mdToHtml(md)` — via `marked`. Raw HTML is **escaped**, not passed through (the
  renderer's `html` hook escapes `<`/`>`), so a stray `<script>` in model output
  becomes inert text. This is the *only* line of defense on the main-side clipboard
  html — there is no DOM/DOMPurify in main — so it is locked by a unit test.
- `mdToSlack(md)` — ~50-line mrkdwn converter: `**b**`→`*b*`, `_i_` kept, `~~s~~`→`~s~`,
  inline/fenced code kept, `# H`→`*H*`, `- `→`• `, numbered lists kept, `> ` kept,
  `[t](u)`→`<u|t>`. Code spans are masked before inline substitution so their
  contents aren't mangled.

## Profile registry (`src/main/profiles.js`)
`profileFor(bundleId | name)` → `'rich' | 'mrkdwn' | 'plain'`. Three *distinct*
strategies:

| profile | write | for |
|---|---|---|
| `mrkdwn` | `writeText(mdToSlack(md))` | Slack, Discord |
| `rich` | `clipboard.write({ html: mdToHtml(md), text: md })` | Mail, Notes, TextEdit, Pages, Word, browsers, **and the default** |
| `plain` | `writeText(md)` (text only, no html) | Markdown-native editors (Obsidian, iA Writer) and terminals |

`rich` is the default because its `text: md` fallback quietly serves both worlds: a
contenteditable (Gmail) reads the html; a markdown-as-text textarea (GitHub/Reddit)
reads the plain `text`. `plain` is text-only on purpose — those apps would otherwise
convert an html flavor into something unwanted.

## Grab seam (`automation.js`) — two changes
1. Also capture the frontmost app's **bundle id** (stable registry key); keep the
   process *name* for reactivation on paste.
2. Snapshot **all present clipboard flavors** (text + html + rtf), not just text, and
   restore only the flavors that were present in `finally` — otherwise writing an
   html flavor leaves it stuck on the user's clipboard. (Images / app-specific
   flavors are not covered; a copied image is lost during an action — accepted.)

## Deliver seam (`pasteBack(text, { markdown })`)
- `markdown: false` → today's behavior: `writeText(text)`.
- `markdown: true` → look up the stashed app's profile, write per the table above.
Then reactivate the source app, ⌘V, restore the original flavors.

Copy-mode (Accessibility off) delivery converts too, via a `markdown`-aware clipboard
write; with no captured source app it uses the `rich` dual-write (html + md text).

## Preview that renders (`Markdown.jsx`, `ActionPanel.jsx`)
When `result.markdown`, the result pane renders Markdown → sanitized HTML
(`marked` + `dompurify`, DOM available in the renderer) styled with the design
tokens, so the bold/bullets/code are visible before pasting. Format is the 5th
action in both hosts (`HotkeyPopover` keys 1–5, `App`).

---

## Commit grouping (dependency order)
- **a.** all-flavor clipboard snapshot/restore + bundle-id capture (`automation.js`)
- **b.** `markdown.js` + `profiles.js` converters + `node --test` unit tests
- **c.** target-aware `pasteBack` + IPC/preload `markdown` plumbing
- **d.** Format action in `transform.js`
- **e.** `Markdown.jsx` render + 5th action in `HotkeyPopover`/`App`

## Acceptance
- Plain text → **Format** → structure shows in the rendered preview.
- From the *same* result: pastes into Gmail/Mail/Notes as rich text, and into Slack
  as `*bold*`/`• `/code mrkdwn.
- A plain-only target (terminal/Obsidian) gets readable Markdown, never an html flavor.
- `mdToHtml('<script>alert(1)</script>')` contains no live `<script>` (tested).
- The user's clipboard (all originally-present flavors) is intact after an action.
