import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Check, Copy, Loader2, PenLine, X, AlertCircle, CornerDownLeft, KeyRound } from 'lucide-react'
import { color, font, radius, shadow, space } from '@tokens'

// All visual values come from tokens.js — nothing is hardcoded here.

// Actions are semantic ids only — prompt text lives in the main process.
const ACTIONS = [
  { id: 'proofread', label: 'Proofread' },
  { id: 'improve', label: 'Improve' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'summarize', label: 'Summarize' }
]
const TONES = ['Professional', 'Confident', 'Friendly', 'Concise']

const ERROR_GENERIC = 'Couldn’t reach the model. Check your key and try again.'
const ERROR_NO_KEY = 'Add the key above to get started.'

// Track macOS system appearance — Electron mirrors it to prefers-color-scheme.
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

  // Load the provider registry once; restore the last choice + per-provider models.
  useEffect(() => {
    let live = true
    window.api
      ?.listProviders()
      .then((list) => {
        if (!live || !list?.length) return
        setProviders(list)
        setModels((prev) => {
          const next = { ...prev }
          for (const p of list) next[p.id] = localStorage.getItem('bp.model.' + p.id) || p.defaultModel
          return next
        })
        const saved = localStorage.getItem('bp.provider')
        setProvider(list.some((p) => p.id === saved) ? saved : list[0].id)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // On provider change: persist, re-check its key, clear transient UI.
  useEffect(() => {
    if (!provider) return
    localStorage.setItem('bp.provider', provider)
    window.api?.hasKey(provider).then(setHasKey).catch(() => setHasKey(false))
    setResult(null)
    setMarks(null)
    setError(null)
    setKeyDraft('')
  }, [provider])

  const setModel = (id, value) => {
    setModels((m) => ({ ...m, [id]: value }))
    localStorage.setItem('bp.model.' + id, value)
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
      } catch (e) {
        if (/no api key/i.test(e?.message || '')) {
          setHasKey(false)
          setError(ERROR_NO_KEY)
        } else {
          setError(ERROR_GENERIC)
        }
      } finally {
        setBusy(null)
      }
    },
    [text, busy, provider]
  )

  const doAction = (a) =>
    run(a.id, async () => {
      const res = await window.api.transform({ text, action: a.id, provider, model: models[provider] })
      setResult({ title: res.title, text: res.text })
      if (res.kind === 'proofread') setMarks(res.changes || [])
    })

  const reTone = (t) =>
    run('tone-' + t, async () => {
      const res = await window.api.transform({ text, action: 'tone', tone: t, provider, model: models[provider] })
      setResult({ title: res.title, text: res.text })
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
      await navigator.clipboard.writeText(result.text)
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
          onChange={(e) => setProvider(e.target.value)}
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
              onChange={(e) => setText(e.target.value)}
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

                <div style={{ padding: space.md }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        className="act"
                        style={pill(false, a.id === 'proofread')}
                        onClick={() => doAction(a)}
                        disabled={!!busy}
                      >
                        {busy === a.id ? <Loader2 size={13} /> : a.id === 'proofread' ? <Check size={13} /> : null}
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...sectionLabel, margin: '13px 0 7px' }}>Tone</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {TONES.map((t) => (
                      <button
                        key={t}
                        className="act"
                        style={pill(false)}
                        onClick={() => reTone(t)}
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
                      <div>
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
                            <button className="act" style={pill(false)} onClick={copy} aria-label="Copy result">
                              {copied ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                            <button style={pill(false, true)} onClick={apply}>
                              <CornerDownLeft size={13} /> Replace
                            </button>
                          </div>
                        </div>
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
