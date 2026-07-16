import { Marked } from 'marked'
import TurndownService from 'turndown'

// Pure Markdown converters used at the grab and deliver seams. No DOM here (main
// process), so mdToHtml's only safety against raw HTML in (untrusted) model output
// is that the html renderer ESCAPES it rather than passing it through - locked by a test.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Neutralize raw HTML at both block and inline level. marked v18 passes a token
// object ({ text }) to renderer hooks; tolerate a bare string too.
const htmlEscaper = (token) => escapeHtml(typeof token === 'string' ? token : token?.text ?? '')

// breaks:true — honor single newlines as <br>. Model output (and grabbed chat
// messages, notifications, addresses) is line-oriented; with breaks:false those
// lines collapse into one paragraph and paste as a single line. GFM/Slack/GitHub
// all treat a newline as a break, which is what users expect on paste.
const md = new Marked({ gfm: true, breaks: true })
md.use({ renderer: { html: htmlEscaper } })

export function mdToHtml(source) {
  return md.parse(String(source ?? ''), { async: false }).trim()
}

// Clipboard variant of mdToHtml for the deliver seam. Slack's composer collapses
// the gap between adjacent <p> blocks to a single newline on paste, gluing
// paragraphs together (#4). Merging p→p boundaries into an explicit <br><br>
// keeps the blank line in Slack and renders the same in margin-honoring editors
// (Gmail, Notion, Word). Other block boundaries (lists, code, headings) are left
// alone. marked emits exactly '</p>\n<p>' between paragraphs, and any literal
// tag text inside a paragraph is HTML-escaped, so the replace can't misfire.
export function mdToClipboardHtml(source) {
  return mdToHtml(source).replace(/<\/p>\n<p>/g, '<br><br>')
}

// HTML -> Markdown for the grab seam: a rich selection populates the clipboard's
// html flavor, which we convert so the model works in Markdown (Case 1). Base
// turndown covers bold/italic/code/lists/headings/blockquotes/links - the 90%;
// tables/images/strikethrough are out of scope this slice.
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*'
})

export function htmlToMd(html) {
  return turndown.turndown(String(html ?? '')).trim()
}

// Models (Groq especially) sometimes wrap a whole reply in a ```markdown fence or
// open with a preamble like "Here's the revised text:". Strip both so the wrapper
// doesn't render as one big code block or ride along into the paste. A ```markdown
// / ```md wrapper is always spurious; a *bare* ``` wrapper is only stripped when
// allowBare is set (prose rewrites) — a Format result can legitimately BE a single
// code block, so we don't unwrap bare fences there.
export function unwrapModelText(raw, { allowBare = false } = {}) {
  let s = String(raw ?? '').trim()
  const fence = s.match(/^```([\w-]*)[ \t]*\n([\s\S]*?)\n```$/)
  if (fence) {
    const lang = fence[1].toLowerCase()
    if (lang === 'markdown' || lang === 'md' || (allowBare && lang === '')) {
      s = fence[2].trim()
    }
  }
  s = s.replace(/^(?:sure[,.!]?|certainly[,.!]?|here(?:'s| is)\b|below is\b)[^\n]*:[ \t]*\n+/i, '')
  // Models sometimes echo the `"""` delimiter our prompts wrap the input in. It's
  // never legitimate output here, so strip a leading/trailing run of ≥3 quotes.
  s = s.replace(/^"{3,}[ \t]*\n?/, '').replace(/\n?[ \t]*"{3,}$/, '')
  return s.trim()
}
