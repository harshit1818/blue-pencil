import { Check, Copy, Loader2, AlertCircle } from 'lucide-react'
import { font, radius, space } from '@tokens'
import { useThemeColors } from './useTheme.js'
import Markdown from './Markdown.jsx'

// Presentational popover card content, shared by the in-app popover (App.jsx)
// and the hotkey overlay (HotkeyPopover.jsx). No state of its own beyond theme;
// all data + handlers arrive as props. The card *chrome* (bg/border/radius/
// shadow) lives in each host's wrapper, not here.

export default function ActionPanel({
  providerLabel,
  actions,
  tones,
  busy,
  error,
  result,
  marks,
  copied,
  onAction, // (id) => void
  onTone, // (tone) => void
  onCopy, // () => void
  primary, // { label, icon, onClick }
  hint = null // optional string shown under the result
}) {
  const C = useThemeColors()

  const pill = (active, isPrimary) => ({
    font: `500 12.5px ${font.grotesk}`,
    padding: `7px 11px`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    border: `1px solid ${isPrimary || active ? C.pencil : C.line}`,
    background: isPrimary ? C.pencil : active ? C.pencilSoft : C.panel,
    color: isPrimary ? C.onPencil : active ? C.pencil : C.ink,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    transition: 'border-color .12s, background .12s, color .12s'
  })

  const sectionLabel = {
    font: `600 10px ${font.mono}`,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: C.muted
  }

  return (
    <>
      <div
        style={{
          padding: '11px 14px',
          borderBottom: `1px solid ${C.line}`,
          background: C.paper,
          ...sectionLabel,
          fontSize: 11,
          letterSpacing: '.06em'
        }}
      >
        Assistant · {providerLabel}
      </div>

      <div style={{ padding: space.md }} aria-busy={!!busy}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {actions.map((a) => (
            <button
              key={a.id}
              className="act"
              style={pill(false, a.id === 'proofread')}
              onClick={() => onAction(a.id)}
              disabled={!!busy}
            >
              {busy === a.id ? <Loader2 size={13} /> : a.id === 'proofread' ? <Check size={13} /> : null}
              {a.label}
            </button>
          ))}
        </div>
        <div style={{ ...sectionLabel, margin: '13px 0 7px' }}>Tone</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {tones.map((t) => (
            <button
              key={t}
              className="act"
              style={pill(false)}
              onClick={() => onTone(t)}
              disabled={!!busy}
            >
              {busy === 'tone-' + t ? <Loader2 size={13} /> : null}
              {t}
            </button>
          ))}
        </div>
      </div>

      {(error || result) && (
        <div style={{ borderTop: `1px solid ${C.line}`, maxHeight: 280, overflowY: 'auto' }}>
          {error && (
            <div
              role="alert"
              style={{
                display: 'flex',
                gap: 7,
                alignItems: 'center',
                padding: 13,
                color: C.mark,
                font: `500 13px ${font.grotesk}`
              }}
            >
              <AlertCircle size={15} /> {error}
            </div>
          )}
          {result && (
            <div role="status" aria-live="polite">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 14px',
                  background: C.paper,
                  borderBottom: `1px solid ${C.line}`
                }}
              >
                <span
                  style={{
                    font: `600 11px ${font.mono}`,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                    color: C.pencil
                  }}
                >
                  {result.title}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="act" style={pill(false)} onClick={onCopy} aria-label="Copy result">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button style={pill(false, true)} onClick={primary.onClick}>
                    {primary.icon} {primary.label}
                  </button>
                </div>
              </div>
              {result.markdown ? (
                <div style={{ padding: 14 }}>
                  <Markdown source={result.text} />
                </div>
              ) : (
                <p
                  style={{
                    margin: 0,
                    padding: 14,
                    font: `400 14.5px/1.65 ${font.serif}`,
                    whiteSpace: 'pre-wrap',
                    color: C.ink
                  }}
                >
                  {result.text}
                </p>
              )}
              {hint && (
                <div style={{ padding: '0 14px 12px', font: `400 12px ${font.grotesk}`, color: C.muted }}>
                  {hint}
                </div>
              )}
              {marks && marks.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: '10px 14px 14px' }}>
                  <div style={{ ...sectionLabel, marginBottom: 7 }}>
                    {marks.length} fix{marks.length > 1 ? 'es' : ''}
                  </div>
                  {marks.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        alignItems: 'baseline',
                        padding: '5px 0',
                        borderTop: i ? `1px dashed ${C.line}` : 'none',
                        font: `400 12px ${font.grotesk}`
                      }}
                    >
                      <span
                        style={{
                          textDecoration: 'line-through',
                          color: C.mark,
                          background: C.markSoft,
                          padding: '0 5px',
                          borderRadius: 4
                        }}
                      >
                        {m.before}
                      </span>
                      <span style={{ color: C.muted }}>→</span>
                      <span
                        style={{
                          color: C.pencil,
                          background: C.pencilSoft,
                          padding: '0 5px',
                          borderRadius: 4,
                          fontWeight: 600
                        }}
                      >
                        {m.after}
                      </span>
                      {m.reason && <span style={{ color: C.muted }}>({m.reason})</span>}
                    </div>
                  ))}
                </div>
              )}
              {marks && marks.length === 0 && (
                <div style={{ padding: '10px 14px', font: `400 12px ${font.grotesk}`, color: C.muted }}>
                  Clean — nothing to fix.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
