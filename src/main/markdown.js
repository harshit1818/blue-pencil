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

const md = new Marked({ gfm: true, breaks: false })
md.use({ renderer: { html: htmlEscaper } })

export function mdToHtml(source) {
  return md.parse(String(source ?? '')).trim()
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
