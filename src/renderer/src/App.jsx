import React, { useState, useRef, useEffect, useCallback } from 'react'
import { PenLine, X, CornerDownLeft, KeyRound, Copy } from 'lucide-react'
import { font, radius, shadow, space } from '@tokens'
import ActionPanel from './ActionPanel.jsx'
import { useThemeColors } from './useTheme.js'

// All visual values come from src/shared/tokens.js — nothing is hardcoded here.

// Actions are semantic ids only — prompt text lives in the main process.
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

const ERROR_GENERIC = 'Couldn’t reach the model. Check your key and try again.'
const ERROR_NO_KEY = 'Add the key above to get started.'

export default function App() {
  const C = useThemeColors()
  const [text, setText] = useState(
    'i thinks the new featrue is realy usefull but the way its implemented have some issue that we should to discuss before shiping it.'
  )
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [models, setModels] = useState({})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [marks, setMarks] = useState(null)
  const [copied, setCopied] = useState(false)
  const [hasKey, setHasKey] = useState(true)
  const [showKeys, setShowKeys] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const wrapRef = useRef(null)

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const providerLabel = providers.find((p) => p.id === provider)?.label || provider

  // Selection lives in main (so the future overlay window shares it). Seed from
  // there and stay subscribed to cross-window changes — one source of truth.
  const applySettings = (s) => {
    if (!s) return
    setProvider(s.provider || '')
    setModels(s.models || {})
  }

  useEffect(() => {
    let live = true
    const unsub = window.api?.onSettingsChanged?.((s) => {
      if (live) applySettings(s)
    })
    Promise.all([
      window.api?.listProviders?.() ?? [],
      window.api?.getSettings?.() ?? { provider: '', models: {} }
    ])
      .then(([list, settings]) => {
        if (!live) return
        if (list?.length) setProviders(list)
        applySettings(settings)
        // One-time migration: lift the old localStorage selection into main, then drop it.
        const oldProvider = localStorage.getItem('bp.provider')
        if (oldProvider) {
          if ((list || []).some((p) => p.id === oldProvider)) window.api?.setProvider(oldProvider)
          for (const p of list || []) {
            const m = localStorage.getItem('bp.model.' + p.id)
            if (m) window.api?.setModel(p.id, m)
            localStorage.removeItem('bp.model.' + p.id)
          }
          localStorage.removeItem('bp.provider')
        }
      })
      .catch(() => {})
    return () => {
      live = false
      if (unsub) unsub()
    }
  }, [])

  // On provider change: re-check its key, clear transient UI.
  useEffect(() => {
    if (!provider) return
    window.api?.hasKey(provider).then(setHasKey).catch(() => setHasKey(false))
    setResult(null)
    setMarks(null)
    setError(null)
    setKeyDraft('')
  }, [provider])

  // Model edits keep the controlled input responsive (local) and write through
  // to main; the broadcast echo confirms.
  const setModel = (id, value) => {
    setModels((m) => ({ ...m, [id]: value }))
    window.api?.setModel(id, value)
  }

  const saveKey = async () => {
    try {
      await window.api.setKey(provider, keyDraft)
      setKeyDraft('')
      setHasKey(true)
      setShowKeys(false)
      setError(null)
    } catch {
      setError('That key didn’t save. Check it and try again.')
    }
  }

  // Render a failed-transform envelope from main. NO_KEY reveals the key panel;
  // everything else shows main's already-normalized message.
  const showError = (env) => {
    if (env?.code === 'NO_KEY') {
      setHasKey(false)
      setError(ERROR_NO_KEY)
    } else {
      setError(env?.message || ERROR_GENERIC)
    }
  }

  const run = useCallback(
    async (id, work) => {
      if (!text.trim() || busy || !provider) return
      setBusy(id)
      setError(null)
      setResult(null)
      setMarks(null)
      setCopied(false)
      try {
        await work()
      } catch {
        // Only true IPC/unexpected failures land here — provider errors come
        // back as a structured envelope, not a throw.
        setError(ERROR_GENERIC)
      } finally {
        setBusy(null)
      }
    },
    [text, busy, provider]
  )

  const doAction = (id) =>
    run(id, async () => {
      const res = await window.api.transform({ text, action: id })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text, markdown: res.result.markdown })
      if (res.result.kind === 'proofread') setMarks(res.result.changes || [])
    })

  const reTone = (t) =>
    run('tone-' + t, async () => {
      const res = await window.api.transform({ text, action: 'tone', tone: t })
      if (!res?.ok) return showError(res)
      setResult({ title: res.result.title, text: res.result.text })
    })

  const apply = () => {
    if (result) {
      setText(result.text)
      setResult(null)
      setMarks(null)
    }
  }
  const copy = async () => {
    try {
      // Markdown results go through main's rich dual-write so a paste lands
      // formatted; plain results use the renderer clipboard directly.
      if (result?.markdown) await window.api?.clipboardWriteResult(result.text, true)
      else await navigator.clipboard.writeText(result.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1300)
    } catch {
      /* clipboard unavailable */
    }
  }

  // Dismiss popover on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pill = (active, primary) => ({
    font: `500 12.5px ${font.grotesk}`,
    padding: `7px 11px`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    border: `1px solid ${primary || active ? C.pencil : C.line}`,
    background: primary ? C.pencil : active ? C.pencilSoft : C.panel,
    color: primary ? '#fff' : active ? C.pencil : C.ink,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    transition: 'all .12s'
  })

  const sectionLabel = {
    font: `600 10px ${font.mono}`,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: C.muted
  }

  const fieldStyle = {
    flex: 1,
    font: `400 12.5px ${font.mono}`,
    padding: '6px 9px',
    borderRadius: radius.sm,
    border: `1px solid ${C.line}`,
    background: C.panel,
    color: C.ink,
    minWidth: 0
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.paper,
        color: C.ink,
        fontFamily: font.grotesk,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <style>{`
        .pop-in{ animation:pop .14s cubic-bezier(.2,.9,.3,1.2); transform-origin:bottom right; }
        @keyframes pop{ from{ opacity:0; transform:scale(.94) translateY(6px);} to{ opacity:1; transform:none;} }
        .badge:hover{ transform:scale(1.06); }
        .act:hover{ border-color:${C.pencil}; color:${C.pencil}; }
        textarea:focus, input:focus, select:focus{ outline:none; }
        .badge:focus-visible, .act:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible{
          outline:2px solid ${C.pencil}; outline-offset:2px;
        }
        @media(prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important;} }
      `}</style>

      {/* Draggable top strip — leaves room for the native traffic lights; no painted chrome. */}
      <div
        style={{
          height: 38,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          padding: `0 ${space.md}px 0 78px`,
          WebkitAppRegion: 'drag'
        }}
      >
        <select
          value={provider}
          onChange={(e) => window.api?.setProvider(e.target.value)}
          aria-label="Provider"
          style={{
            WebkitAppRegion: 'no-drag',
            font: `500 11.5px ${font.grotesk}`,
            color: C.ink,
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: radius.sm,
            padding: '3px 6px',
            cursor: 'pointer'
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          className="act"
          onClick={() => setShowKeys((s) => !s)}
          aria-label="API keys and model"
          style={{ ...pill(showKeys), WebkitAppRegion: 'no-drag', padding: '5px 7px' }}
        >
          <KeyRound size={13} />
        </button>
        <span style={{ marginLeft: 'auto', font: `400 11px ${font.mono}`, color: C.muted }}>
          {words} words
        </span>
      </div>

      {/* Writing surface */}
      <div
        style={{
          flex: 1,
          padding: `${space.sm}px ${space.xl}px ${space.xl}px`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start'
        }}
      >
        <div style={{ width: '100%', maxWidth: 680 }}>
          {/* keys + model panel — auto-shows when the active provider has no key */}
          {provider && (!hasKey || showKeys) && (
            <div
              style={{
                marginBottom: space.md,
                padding: 12,
                background: C.pencilSoft,
                border: `1px solid ${C.line}`,
                borderRadius: radius.md,
                display: 'flex',
                flexDirection: 'column',
                gap: space.sm
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                <KeyRound size={15} color={C.pencil} />
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                  placeholder={hasKey ? `Replace ${providerLabel} key…` : `${providerLabel} API key…`}
                  style={fieldStyle}
                />
                <button style={pill(false, true)} onClick={saveKey} disabled={!keyDraft.trim()}>
                  Save to Keychain
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                <span style={{ ...sectionLabel, whiteSpace: 'nowrap' }}>Model</span>
                <input
                  value={models[provider] || ''}
                  onChange={(e) => setModel(provider, e.target.value)}
                  placeholder="model id"
                  style={fieldStyle}
                />
                {hasKey && (
                  <span style={{ font: `400 11px ${font.mono}`, color: C.muted, whiteSpace: 'nowrap' }}>
                    key saved
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={wrapRef} style={{ position: 'relative' }}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                // A result is tied to the text it was generated from; editing
                // invalidates it so Replace can't clobber newer text.
                if (result || marks) {
                  setResult(null)
                  setMarks(null)
                }
              }}
              placeholder="Write here…"
              style={{
                width: '100%',
                minHeight: 300,
                padding: '18px 18px 44px',
                boxSizing: 'border-box',
                resize: 'vertical',
                border: `1px solid ${C.line}`,
                borderRadius: radius.md,
                background: C.panel,
                font: `400 16px/1.7 ${font.serif}`,
                color: C.ink
              }}
            />

            {/* the floating tab — the signature element, anchored to the box corner */}
            <button
              className="badge"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Close assistant' : 'Open assistant'}
              style={{
                position: 'absolute',
                right: 14,
                bottom: 16,
                width: 38,
                height: 38,
                borderRadius: radius.pill,
                border: 'none',
                cursor: 'pointer',
                background: open ? C.ink : C.pencil,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                boxShadow: shadow.badge,
                transition: 'transform .12s, background .12s'
              }}
            >
              {open ? <X size={18} /> : <PenLine size={17} />}
            </button>

            {/* floating popover — anchored to the box, not pushing layout */}
            {open && (
              <div
                className="pop-in"
                role="dialog"
                aria-label="Assistant"
                style={{
                  position: 'absolute',
                  right: 14,
                  bottom: 62,
                  width: 'min(330px, calc(100% - 28px))',
                  background: C.panel,
                  border: `1px solid ${C.line}`,
                  borderRadius: radius.lg,
                  boxShadow: shadow.popover,
                  overflow: 'hidden',
                  zIndex: 5
                }}
              >
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
                  onCopy={copy}
                  primary={
                    // A Markdown result can't render in the plain editor, so Replace
                    // would just dump raw `**`/`#` source — Copy (rich) is the useful
                    // action. Plain results still Replace in place.
                    result?.markdown
                      ? { label: 'Copy', icon: <Copy size={13} />, onClick: copy }
                      : { label: 'Replace', icon: <CornerDownLeft size={13} />, onClick: apply }
                  }
                />
              </div>
            )}
          </div>

          <p style={{ margin: '14px 2px 0', font: `400 12px ${font.mono}`, color: C.muted }}>
            Click the <span style={{ color: C.pencil }}>●</span> at the corner of the box to open the assistant.
          </p>
        </div>
      </div>
    </div>
  )
}
