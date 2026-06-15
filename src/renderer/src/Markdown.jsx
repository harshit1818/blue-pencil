import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { font, radius } from '@tokens'
import { useThemeColors } from './useTheme.js'

// Renders the model's Markdown result to styled, sanitized HTML so the bold/
// bullets/code are visible before delivering. DOMPurify is the renderer-side
// safety net (the deliver-side html has its own escaping in main/markdown.js).

// breaks:false — standard Markdown, so single newlines fold into the paragraph
// instead of becoming hard <br>s (avoids a line break per source line).
marked.setOptions({ gfm: true, breaks: false })

export default function Markdown({ source }) {
  const C = useThemeColors()
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(String(source ?? ''))),
    [source]
  )

  return (
    <div
      className="bp-md"
      style={{ font: `400 14px/1.6 ${font.serif}`, color: C.ink }}
    >
      <style>{`
        .bp-md > :first-child { margin-top: 0; }
        .bp-md > :last-child { margin-bottom: 0; }
        .bp-md h1, .bp-md h2, .bp-md h3, .bp-md h4 {
          font: 600 14.5px ${font.grotesk}; color: ${C.ink}; margin: 12px 0 6px;
        }
        .bp-md p { margin: 0 0 8px; }
        .bp-md ul, .bp-md ol { margin: 0 0 8px; padding-left: 20px; }
        .bp-md li { margin: 2px 0; }
        .bp-md strong { font-weight: 650; }
        .bp-md a { color: ${C.pencil}; }
        .bp-md code {
          font: 12.5px ${font.mono}; background: ${C.pencilSoft};
          color: ${C.ink}; padding: 1px 4px; border-radius: 4px;
        }
        .bp-md pre {
          background: ${C.pencilSoft}; border: 1px solid ${C.line};
          border-radius: ${radius.sm}px; padding: 9px 11px; overflow-x: auto; margin: 0 0 8px;
        }
        .bp-md pre code { background: none; padding: 0; }
        .bp-md blockquote {
          margin: 0 0 8px; padding-left: 11px; border-left: 3px solid ${C.line}; color: ${C.muted};
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
