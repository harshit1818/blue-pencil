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

// --- Markdown to Slack mrkdwn -----------------------------------------------
// Slack renders its own markup on input, so we hand it plain text in that markup.
// Code spans and bold runs are masked with a NUL sentinel (never present in real
// text) before the italic pass, so a converted single-star bold isn't re-read as
// italic and masked contents survive verbatim. Restored last.

const SEP = String.fromCharCode(0)

function inlineToSlack(text) {
  const code = []
  const bold = []
  let s = String(text)

  s = s.replace(/`([^`]+)`/g, (_m, c) => {
    code.push(c)
    return SEP + 'C' + (code.length - 1) + SEP
  })

  const maskBold = (_m, c) => {
    bold.push(c)
    return SEP + 'B' + (bold.length - 1) + SEP
  }
  s = s.replace(/\*\*([^*]+)\*\*/g, maskBold).replace(/__([^_]+)__/g, maskBold)

  s = s.replace(/\*([^*\s][^*]*?)\*/g, '_$1_') // *italic* to _italic_ (_italic_ already ok)
  s = s.replace(/~~([^~]+)~~/g, '~$1~') // strikethrough
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>') // links

  s = s.replace(new RegExp(SEP + 'B(\\d+)' + SEP, 'g'), (_m, i) => '*' + bold[Number(i)] + '*')
  return s.replace(new RegExp(SEP + 'C(\\d+)' + SEP, 'g'), (_m, i) => '`' + code[Number(i)] + '`')
}

export function mdToSlack(source) {
  const lines = String(source ?? '').split('\n')
  const out = []
  let inFence = false

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      out.push(line) // Slack supports ``` fences verbatim
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      out.push('*' + inlineToSlack(heading[1]).trim() + '*') // no headings -> bold
      continue
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/)
    if (bullet) {
      out.push(bullet[1] + '• ' + inlineToSlack(bullet[2]))
      continue
    }

    // Numbered lists and blockquotes survive as-is; only inline markup changes.
    const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (ordered) {
      out.push(ordered[1] + ordered[2] + '. ' + inlineToSlack(ordered[3]))
      continue
    }

    out.push(inlineToSlack(line))
  }

  return out.join('\n')
}
