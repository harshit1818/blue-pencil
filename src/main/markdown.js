import { Marked } from 'marked'

// Pure Markdown converters used at the deliver seam. No DOM here (main process),
// so mdToHtml's only safety against raw HTML in (untrusted) model output is that
// the html renderer ESCAPES it rather than passing it through - locked by a test.

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
