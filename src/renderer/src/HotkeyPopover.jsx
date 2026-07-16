import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, CornerDownLeft } from 'lucide-react'
import { font, radius } from '@tokens'
import ActionPanel from './ActionPanel.jsx'
import Markdown from './Markdown.jsx'
import { useThemeColors } from './useTheme.js'

// The hotkey overlay's container: a read-only preview of the grabbed text plus
// the shared ActionPanel. Floats over other apps; the active provider comes from
// main (settings), so it sends only { text, action }. The primary button and the
// empty-state copy switch on whether Accessibility (auto-grab/paste) is granted.

const ACTIONS = [
  { id: 'proofread', label: 'Proofread' },
  { id: 'improve', label: 'Improve' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'paraphrase', label: 'Paraphrase' },
  { id: 'neutralize', label: 'Neutralize' },
  { id: 'formalize', label: 'Formalize' },
  { id: 'coherence', label: 'Coherence' },
  { id: 'format', label: 'Format' }
]
const TONES = ['Professional', 'Confident', 'Friendly', 'Concise']
const HOTKEY_LABEL = "⌘⇧'"

const ERROR_GENERIC = 'Couldn’t reach the model. Check your key and try again.'
const ERROR_NO_KEY = 'Add a key in Blue Pencil to get started.'
const COPIED_HINT = 'Copied — press ⌘V in your app.'

export default function HotkeyPopover() {
  const C = useThemeColors()
  const [captured, setCaptured] = useState('')
  const [capturedMarkdown, setCapturedMarkdown] = useState(false)
  const [accessibility, setAccessibility] = useState(false)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [marks, setMarks] = useState(null)
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState(null)
  const [needsRestart, setNeedsRestart] = useState(false)
  const rootRef = useRef(null)
  const onKeyRef = useRef(null)

  const providerLabel = providers.find((p) => p.id === provider)?.label || provider
  const words = captured.trim() ? captured.trim().split(/\s+/).length : 0

  // Each hotkey invocation delivers fresh captured text + permission status.
  useEffect(() => {
    const applySettings = (s) => {
      if (s) setProvider(s.provider || '')
    }
    const unsubShow = window.api?.onPopoverShow?.(({ text, accessibility: a, markdown: m }) => {
      setCaptured(text || '')
      setCapturedMarkdown(Boolean(m))
      setAccessibility(Boolean(a))
      setBusy(null)
      setError(null)
      setResult(null)
      setMarks(null)
      setCopied(false)
      setHint(null)
      setNeedsRestart(false)
    })
    const unsubSettings = window.api?.onSettingsChanged?.(applySettings)
    // Tell main the listeners are attached so it can safely deliver the capture
    // (fixes the first-summon race).
    window.api?.popoverReady?.()
    Promise.all([
      window.api?.listProviders?.() ?? [],
      window.api?.getSettings?.() ?? { provider: '' }
    ])
      .then(([list, settings]) => {
        if (list?.length) setProviders(list)
        applySettings(settings)
      })
      .catch(() => {})
    return () => {
      if (unsubShow) unsubShow()
      if (unsubSettings) unsubSettings()
    }
  }, [])

  // Keyboard-first: Escape dismisses; Enter runs the primary; 1-4 run the four
  // actions. A stable wrapper calls the latest handler (held in a ref) so it
  // always sees current state without re-subscribing each render.
  useEffect(() => {
    const handler = (e) => onKeyRef.current?.(e)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Report the card's size so the transparent window hugs it (no big click area).
  useEffect(() => {
    if (!rootRef.current || !window.ResizeObserver) return
    const ro = new ResizeObserver(() => {
      const el = rootRef.current
      if (el) window.api?.popoverResize?.(el.offsetWidth, el.offsetHeight)
    })
    ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [])

  const showError = (env) => {
    setError(env?.code === 'NO_KEY' ? ERROR_NO_KEY : env?.message || ERROR_GENERIC)
  }

  const run = useCallback(
    async (id, work) => {
      if (!captured.trim() || busy) return
      setBusy(id)
      setError(null)
      setResult(null)
      setMarks(null)
      setCopied(false)
      setHint(null)
      try {
        await work()
      } catch {
        setError(ERROR_GENERIC)
      } finally {
        setBusy(null)
      }
    },
    [captured, busy]
  )

  const doAction = (id) =>
    run(id, async () => {
      const res = await window.api.transform({ text: captured, action: id, markdown: capturedMarkdown })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text, markdown: res.result.markdown })
      if (res.result.kind === 'proofread') setMarks(res.result.changes || [])
    })

  const reTone = (t) =>
    run('tone-' + t, async () => {
      const res = await window.api.transform({
        text: captured,
        action: 'tone',
        tone: t,
        markdown: capturedMarkdown
      })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text, markdown: res.result.markdown })
    })

  // v1 DELIVER seam. Granted: paste back into the source app (main does it, then
  // dismisses). Not granted: v0 behavior — copy to clipboard + "press ⌘V" hint.
  const deliver = async () => {
    if (!result) return
    const markdown = !!result.markdown
    if (accessibility) {
      await window.api.pasteBack(result.text, markdown)
      return
    }
    await window.api.clipboardWriteResult(result.text, markdown)
    setCopied(true)
    setHint(COPIED_HINT)
    setTimeout(() => setCopied(false), 1300)
  }

  const enableAuto = async () => {
    await window.api?.requestAccessibility?.()
    window.api?.openAccessibilitySettings?.()
    setNeedsRestart(true)
  }

  // Reassigned every render so the keydown wrapper always sees fresh state:
  // a stable listener reads this ref instead of being resubscribed every render.
  // eslint-disable-next-line react-hooks/refs
  onKeyRef.current = (e) => {
    if (e.key === 'Escape') {
      window.api?.popoverDismiss?.()
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!captured.trim() || busy) return
    if (e.key === 'Enter') {
      if (result) deliver()
      else doAction(ACTIONS[0].id)
      return
    }
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= ACTIONS.length) doAction(ACTIONS[n - 1].id)
  }

  const primary = accessibility
    ? { label: 'Paste back', icon: <CornerDownLeft size={13} />, onClick: deliver }
    : { label: 'Copy', icon: <Copy size={13} />, onClick: deliver }

  const linkBtn = {
    font: `600 11px ${font.grotesk}`,
    color: C.pencil,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline'
  }

  return (
    <div
      ref={rootRef}
      style={{
        width: 340,
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        fontFamily: font.grotesk,
        color: C.ink
      }}
    >
      <style>{`
        .act:hover{ border-color:${C.pencil}; color:${C.pencil}; }
        button:focus-visible, .act:focus-visible{ outline:2px solid ${C.pencil}; outline-offset:2px; }
        @media(prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important;} }
      `}</style>

      {!captured.trim() ? (
        <div style={{ padding: 16, font: `400 13px ${font.grotesk}`, color: C.muted }}>
          {accessibility
            ? `Select text, then press ${HOTKEY_LABEL}.`
            : `Copy text (⌘C), then press ${HOTKEY_LABEL}.`}
        </div>
      ) : (
        <>
          {/* read-only preview of the grabbed text — rendered when it's a rich (Markdown) grab */}
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.line}`, background: C.paper }}>
            {capturedMarkdown ? (
              <div style={{ maxHeight: 72, overflow: 'hidden' }}>
                <Markdown source={captured} />
              </div>
            ) : (
              <div
                style={{
                  font: `400 12.5px/1.5 ${font.serif}`,
                  color: C.ink,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {captured}
              </div>
            )}
            <div style={{ font: `400 10px ${font.mono}`, color: C.muted, marginTop: 4 }}>{words} words</div>
          </div>

          <ActionPanel
            providerLabel={providerLabel}
            actions={ACTIONS}
            tones={TONES}
            busy={busy}
            error={error}
            result={result}
            marks={marks}
            copied={copied}
            onAction={doAction}
            onTone={reTone}
            onCopy={deliver}
            primary={primary}
            hint={hint}
          />

          {!accessibility && (
            <div
              style={{
                padding: '8px 14px',
                borderTop: `1px solid ${C.line}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                font: `400 11px ${font.grotesk}`,
                color: C.muted
              }}
            >
              {needsRestart ? (
                <>
                  <span>Enabled it? Restart to turn on auto-paste.</span>
                  <button onClick={() => window.api?.relaunchApp?.()} style={linkBtn}>
                    Restart
                  </button>
                </>
              ) : (
                <>
                  <span>Auto-paste is off — you’ll paste with ⌘V.</span>
                  <button onClick={enableAuto} style={linkBtn}>
                    Enable
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
