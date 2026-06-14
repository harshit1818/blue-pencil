import React, { useState, useRef, useEffect, useCallback } from "react";
import { Check, Copy, Loader2, PenLine, X, AlertCircle, CornerDownLeft } from "lucide-react";

// ---- design language carried over from the web version: ink on warm paper,
// an editor's blue pencil as the single accent, proof-red for corrections.
const C = {
  ink: "#16181d", paper: "#faf8f3", panel: "#ffffff", line: "#e7e2d6",
  muted: "#6f6a5f", pencil: "#1f5fa8", pencilSoft: "#eaf1fa",
  mark: "#c2453d", markSoft: "#fbecea",
};
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
const GROTESK = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const MONO = 'ui-monospace,"SF Mono","Cascadia Code",Menlo,monospace';

const MODEL = "claude-sonnet-4-6";
// The single seam to your own key/provider when this leaves Claude.ai.
async function ask(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

const ACTIONS = [
  { id: "proof", label: "Proofread", instr: "PROOF" },
  { id: "improve", label: "Improve", instr: "Revise to improve clarity, flow and word choice while preserving meaning and voice." },
  { id: "simplify", label: "Simplify", instr: "Rewrite so it is clear and easy to read; cut unnecessary words." },
  { id: "summarize", label: "Summarize", instr: "Summarize concisely in the same voice." },
];
const TONES = ["Professional", "Confident", "Friendly", "Concise"];

export default function FloatingPrototype() {
  const [text, setText] = useState(
    "i thinks the new featrue is realy usefull but the way its implemented have some issue that we should to discuss before shiping it."
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [marks, setMarks] = useState(null);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const run = useCallback(async (id, work) => {
    if (!text.trim() || busy) return;
    setBusy(id); setError(null); setResult(null); setMarks(null); setCopied(false);
    try { await work(); } catch (e) { setError(e.message || "Try again."); } finally { setBusy(null); }
  }, [text, busy]);

  const doAction = (a) => {
    if (a.instr === "PROOF") return run(a.id, async () => {
      const raw = await ask(
        `You are a copy editor. Correct spelling, grammar and punctuation below. Respond ONLY with minified JSON shaped {"corrected":string,"changes":[{"before":string,"after":string,"reason":string}]}. Empty changes if clean.\n\nText:\n"""${text}"""`
      );
      let p; try { p = JSON.parse(raw.replace(/^```json?|```$/g, "").trim()); } catch { setResult({ kind: "rw", title: a.label, text: raw }); return; }
      setResult({ kind: "rw", title: a.label, text: p.corrected || text });
      setMarks(Array.isArray(p.changes) ? p.changes : []);
    });
    return run(a.id, async () => {
      const out = await ask(`${a.instr}\n\nReturn ONLY the resulting text, no preamble.\n\nText:\n"""${text}"""`);
      setResult({ kind: "rw", title: a.label, text: out });
    });
  };
  const reTone = (t) => run("tone-" + t, async () => {
    const out = await ask(`Rewrite in a ${t.toLowerCase()} tone, preserving meaning. Return ONLY the text.\n\nText:\n"""${text}"""`);
    setResult({ kind: "rw", title: `${t} tone`, text: out });
  });

  const apply = () => { if (result) { setText(result.text); setResult(null); setMarks(null); } };
  const copy = async () => { try { await navigator.clipboard.writeText(result.text); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch {} };

  // close popover on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const pill = (active, primary) => ({
    font: `500 12.5px ${GROTESK}`, padding: "7px 11px", borderRadius: 7, cursor: "pointer",
    border: `1px solid ${primary ? C.pencil : active ? C.pencil : C.line}`,
    background: primary ? C.pencil : active ? C.pencilSoft : C.panel,
    color: primary ? "#fff" : active ? C.pencil : C.ink,
    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "all .12s",
  });

  return (
    <div style={{ minHeight: "100%", background: "#ece8df", padding: "30px 16px", fontFamily: GROTESK, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <style>{`
        .mac-shadow{ box-shadow:0 24px 60px -12px rgba(20,24,29,.34),0 8px 18px -10px rgba(20,24,29,.3); }
        .pop-in{ animation:pop .14s cubic-bezier(.2,.9,.3,1.2); transform-origin:bottom right; }
        @keyframes pop{ from{ opacity:0; transform:scale(.94) translateY(6px);} to{ opacity:1; transform:none;} }
        .badge:hover{ transform:scale(1.06); }
        .act:hover{ border-color:${C.pencil}; color:${C.pencil}; }
        textarea:focus{ outline:none; }
        @media(prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important;} }
      `}</style>

      {/* ---- mac window ---- */}
      <div className="mac-shadow" style={{ width: "100%", maxWidth: 720, background: C.paper, borderRadius: 12, overflow: "hidden", border: `1px solid rgba(0,0,0,.08)` }}>
        {/* title bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: "#f0ece2", borderBottom: `1px solid ${C.line}` }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ marginLeft: 10, font: `600 13px ${SERIF}`, color: C.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <PenLine size={14} color={C.pencil} /> Writing Desk
          </span>
          <span style={{ marginLeft: "auto", font: `400 11px ${MONO}`, color: C.muted }}>{words} words</span>
        </div>

        {/* writing surface with the floating tab anchored inside */}
        <div style={{ padding: 22 }}>
          <div ref={wrapRef} style={{ position: "relative" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write here…"
              style={{ width: "100%", minHeight: 240, padding: "18px 18px 44px", boxSizing: "border-box", resize: "vertical",
                border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, font: `400 16px/1.7 ${SERIF}`, color: C.ink }}
            />

            {/* the floating tab — sits at the corner of the box, opens on click */}
            <button
              className="badge"
              onClick={() => setOpen((o) => !o)}
              aria-label="Open assistant"
              style={{ position: "absolute", right: 14, bottom: 16, width: 38, height: 38, borderRadius: "50%",
                border: "none", cursor: "pointer", background: open ? C.ink : C.pencil, color: "#fff",
                display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(31,95,168,.4)", transition: "transform .12s, background .12s" }}
            >
              {open ? <X size={18} /> : <PenLine size={17} />}
            </button>

            {/* floating popover — anchored to the box, not pushing layout */}
            {open && (
              <div className="pop-in" style={{ position: "absolute", right: 14, bottom: 62, width: "min(330px, calc(100% - 28px))",
                background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 16px 40px -8px rgba(20,24,29,.3)", overflow: "hidden", zIndex: 5 }}>
                <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.line}`, background: C.paper, font: `600 11px ${MONO}`, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted }}>
                  Assistant
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {ACTIONS.map((a) => (
                      <button key={a.id} className="act" style={pill(false, a.id === "proof")} onClick={() => doAction(a)} disabled={!!busy}>
                        {busy === a.id ? <Loader2 size={13} /> : a.id === "proof" ? <Check size={13} /> : null}{a.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ font: `600 10px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, margin: "13px 0 7px" }}>Tone</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {TONES.map((t) => (
                      <button key={t} className="act" style={pill(false)} onClick={() => reTone(t)} disabled={!!busy}>
                        {busy === "tone-" + t ? <Loader2 size={13} /> : null}{t}
                      </button>
                    ))}
                  </div>
                </div>

                {(error || result) && (
                  <div style={{ borderTop: `1px solid ${C.line}`, maxHeight: 280, overflowY: "auto" }}>
                    {error && (
                      <div style={{ display: "flex", gap: 7, alignItems: "center", padding: 13, color: C.mark, font: `500 13px ${GROTESK}` }}>
                        <AlertCircle size={15} /> {error}
                      </div>
                    )}
                    {result && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", padding: "9px 14px", background: C.paper, borderBottom: `1px solid ${C.line}` }}>
                          <span style={{ font: `600 11px ${MONO}`, letterSpacing: ".05em", textTransform: "uppercase", color: C.pencil }}>{result.title}</span>
                          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                            <button className="act" style={pill(false)} onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
                            <button style={pill(false, true)} onClick={apply}><CornerDownLeft size={13} /> Replace</button>
                          </div>
                        </div>
                        <p style={{ margin: 0, padding: 14, font: `400 14.5px/1.65 ${SERIF}`, whiteSpace: "pre-wrap", color: C.ink }}>{result.text}</p>
                        {marks && marks.length > 0 && (
                          <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 14px 14px" }}>
                            <div style={{ font: `600 10px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>{marks.length} fix{marks.length > 1 ? "es" : ""}</div>
                            {marks.map((m, i) => (
                              <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", padding: "5px 0", borderTop: i ? `1px dashed ${C.line}` : "none", font: `400 12px ${GROTESK}` }}>
                                <span style={{ textDecoration: "line-through", color: C.mark, background: C.markSoft, padding: "0 5px", borderRadius: 4 }}>{m.before}</span>
                                <span style={{ color: C.muted }}>→</span>
                                <span style={{ color: C.pencil, background: C.pencilSoft, padding: "0 5px", borderRadius: 4, fontWeight: 600 }}>{m.after}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {marks && marks.length === 0 && (
                          <div style={{ padding: "10px 14px", font: `400 12px ${GROTESK}`, color: C.muted }}>Clean — nothing to fix.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <p style={{ margin: "14px 2px 0", font: `400 12px ${MONO}`, color: C.muted }}>
            Click the <span style={{ color: C.pencil }}>●</span> at the corner of the box to open the assistant.
          </p>
        </div>
      </div>
    </div>
  );
}
