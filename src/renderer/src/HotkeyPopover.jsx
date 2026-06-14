import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy } from 'lucide-react'
import { color, font, radius } from '@tokens'
import ActionPanel from './ActionPanel.jsx'

// The hotkey overlay's container: a read-only preview of the grabbed text plus
// the shared ActionPanel. Floats over other apps; the active provider comes from
// main (settings), so it sends only { text, action } and never thinks about
// providers. The card chrome lives here; the panel content is shared.

const ACTIONS = [
  { id: 'proofread', label: 'Proofread' },
  { id: 'improve', label: 'Improve' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'summarize', label: 'Summarize' }
]
const TONES = ['Professional', 'Confident', 'Friendly', 'Concise']
const HOTKEY_LABEL = "⌘⇧'"

const ERROR_GENERIC = 'Couldn’t reach the model. Check your key and try again.'
const ERROR_NO_KEY = 'Add a key in Blue Pencil to get started.'
const COPIED_HINT = 'Copied — press ⌘V in your app.'

function useThemeColors() {
  const pick = () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? color.dark : color.light
  const [c, setC] = useState(pick)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setC(pick())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return c
}

export default function HotkeyPopover() {
  const C = useThemeColors()
  const [captured, setCaptured] = useState('')
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [marks, setMarks] = useState(null)
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState(null)
  const rootRef = useRef(null)
  const onKeyRef = useRef(null)

  const providerLabel = providers.find((p) => p.id === provider)?.label || provider
  const words = captured.trim() ? captured.trim().split(/\s+/).length : 0

  // Each hotkey invocation delivers fresh captured text — reset everything.
  useEffect(() => {
    const applySettings = (s) => {
      if (s) setProvider(s.provider || '')
    }
    const unsubShow = window.api?.onPopoverShow?.(({ text }) => {
      setCaptured(text || '')
      setBusy(null)
      setError(null)
      setResult(null)
      setMarks(null)
      setCopied(false)
      setHint(null)
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
      const res = await window.api.transform({ text: captured, action: id })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text })
      if (res.result.kind === 'proofread') setMarks(res.result.changes || [])
    })

  const reTone = (t) =>
    run('tone-' + t, async () => {
      const res = await window.api.transform({ text: captured, action: 'tone', tone: t })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text })
    })

  // v0 "deliver" seam: write to clipboard; the user pastes. Popover stays open.
  // v1 adds reactivate-prev-app + synth-⌘V here, then dismisses.
  const deliver = async () => {
    if (!result) return
    await window.api.clipboardWrite(result.text)
    setCopied(true)
    setHint(COPIED_HINT)
    setTimeout(() => setCopied(false), 1300)
  }

  // Reassigned every render so the keydown wrapper always sees fresh state.
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
          Copy text (⌘C), then press {HOTKEY_LABEL}.
        </div>
      ) : (
        <>
          {/* read-only preview of the grabbed text */}
          <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.line}`, background: C.paper }}>
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
            primary={{ label: 'Copy', icon: <Copy size={13} />, onClick: deliver }}
            hint={hint}
          />
        </>
      )}
    </div>
  )
}
