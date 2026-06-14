import React, { useState, useRef, useCallback } from "react";
import { Check, Copy, RotateCcw, Loader2, PenLine, AlertCircle } from "lucide-react";

// ---- palette: grounded in the copyeditor's desk -------------------------
// ink on warm paper, an editor's blue pencil as the one accent, proof-red
// reserved strictly for flagged corrections.
const C = {
  ink: "#16181d",
  paper: "#faf8f3",
  panel: "#ffffff",
  line: "#e7e2d6",
  muted: "#6f6a5f",
  pencil: "#1f5fa8", // editor's blue pencil — primary accent
  pencilSoft: "#eaf1fa",
  mark: "#c2453d", // proofreader's red — corrections only
  markSoft: "#fbecea",
};

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const GROTESK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace';

const MODEL = "claude-sonnet-4-6";

// Single point of contact with the model. Swap this function's body to point
// at your own key / provider when you run this outside Claude.
async function ask(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const REWRITES = [
  { id: "improve", label: "Improve", hint: "clarity, flow, word choice",
    instr: "Revise the text to improve clarity, flow and word choice while preserving the author's meaning and voice." },
  { id: "simplify", label: "Simplify", hint: "plainer, shorter",
    instr: "Rewrite the text so it is clear and easy to read. Cut unnecessary words and untangle complex phrasing." },
  { id: "expand", label: "Expand", hint: "add detail",
    instr: "Expand the text with more detail and supporting points, keeping the same voice." },
  { id: "summarize", label: "Summarize", hint: "the gist",
    instr: "Summarize the text concisely in the same voice." },
];

const TONES = ["Professional", "Confident", "Friendly", "Concise", "Academic", "Casual"];

export default function WritingDesk() {
  const [text, setText] = useState(
    "i thinks the new featrue is realy usefull but the way its implemented have some issue that we should to discuss before shipping it to the users."
  );
  const [busy, setBusy] = useState(null); // id of running action
  const [error, setError] = useState(null);
  const [tone, setTone] = useState("Professional");
  const [custom, setCustom] = useState("");

  const [result, setResult] = useState(null); // { kind, title, text }
  const [marks, setMarks] = useState(null); // proofread changes
  const [prev, setPrev] = useState(null); // for undo
  const [copied, setCopied] = useState(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;

  const run = useCallback(async (id, work) => {
    if (!text.trim() || busy) return;
    setBusy(id); setError(null); setResult(null); setMarks(null); setCopied(false);
    try { await work(); }
    catch (e) { setError(e.message || "Something went wrong. Try again."); }
    finally { setBusy(null); }
  }, [text, busy]);

  const rewrite = (action) => run(action.id, async () => {
    const out = await ask(
      `${action.instr}\n\nReturn ONLY the rewritten text — no preamble, quotes, or commentary.\n\nText:\n"""${text}"""`
    );
    setResult({ kind: "rewrite", title: action.label, text: out });
  });

  const retone = () => run("tone", async () => {
    const out = await ask(
      `Rewrite the text in a ${tone.toLowerCase()} tone, preserving meaning. Return ONLY the rewritten text — no preamble or commentary.\n\nText:\n"""${text}"""`
    );
    setResult({ kind: "rewrite", title: `${tone} tone`, text: out });
  });

  const detectTone = () => run("detect", async () => {
    const out = await ask(
      `In 2–3 sentences, describe how the following text comes across to a reader — its tone and the impression it gives. Return only the analysis.\n\nText:\n"""${text}"""`
    );
    setResult({ kind: "note", title: "How it reads", text: out });
  });

  const customRun = () => run("custom", async () => {
    const out = await ask(
      `${custom}\n\nReturn ONLY the resulting text — no preamble or commentary.\n\nText:\n"""${text}"""`
    );
    setResult({ kind: "rewrite", title: "Custom", text: out });
  });

  const proofread = () => run("proof", async () => {
    const raw = await ask(
      `You are a copy editor. Correct spelling, grammar and punctuation in the text below. ` +
      `Respond ONLY with minified JSON (no markdown, no backticks) shaped exactly as ` +
      `{"corrected": string, "changes": [{"before": string, "after": string, "reason": string}]}. ` +
      `If nothing needs fixing, return an empty changes array.\n\nText:\n"""${text}"""`
    );
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```json?|```$/g, "").trim()); }
    catch { setResult({ kind: "rewrite", title: "Proofread", text: raw }); return; }
    setResult({ kind: "rewrite", title: "Proofread", text: parsed.corrected || text });
    setMarks(Array.isArray(parsed.changes) ? parsed.changes : []);
  });

  const apply = () => {
    if (!result) return;
    setPrev(text);
    setText(result.text);
    setResult(null); setMarks(null);
  };
  const undo = () => { if (prev != null) { setText(prev); setPrev(null); } };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };

  const btn = (active) => ({
    font: `500 13px ${GROTESK}`, padding: "8px 13px", borderRadius: 7,
    border: `1px solid ${active ? C.pencil : C.line}`,
    background: active ? C.pencilSoft : C.panel,
    color: active ? C.pencil : C.ink, cursor: "pointer", whiteSpace: "nowrap",
    transition: "all .12s", display: "inline-flex", alignItems: "center", gap: 6,
  });

  return (
    <div style={{ minHeight: "100%", background: C.paper, color: C.ink, fontFamily: GROTESK, padding: "28px 20px 44px" }}>
      <style>{`
        .wd-grid { display:grid; grid-template-columns:1fr; gap:22px; max-width:1080px; margin:0 auto; }
        @media(min-width:860px){ .wd-grid{ grid-template-columns:1.15fr .85fr; align-items:start; } }
        .wd-ta::placeholder{ color:${C.muted}; }
        .wd-ta:focus{ outline:none; border-color:${C.pencil}; box-shadow:0 0 0 3px ${C.pencilSoft}; }
        .wd-act:hover{ border-color:${C.pencil}!important; color:${C.pencil}!important; }
        @media(prefers-reduced-motion:reduce){ *{transition:none!important;} }
      `}</style>

      <header style={{ maxWidth: 1080, margin: "0 auto 22px", display: "flex", alignItems: "baseline", gap: 12, borderBottom: `2px solid ${C.ink}`, paddingBottom: 12 }}>
        <PenLine size={22} color={C.pencil} style={{ alignSelf: "center" }} />
        <h1 style={{ font: `600 26px/1 ${SERIF}`, margin: 0, letterSpacing: "-.01em" }}>The Writing Desk</h1>
        <span style={{ font: `400 12px ${MONO}`, color: C.muted, marginLeft: "auto" }}>your text · your model</span>
      </header>

      <div className="wd-grid">
        {/* writing surface */}
        <section>
          <label style={{ font: `600 11px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted }}>Draft</label>
          <textarea
            className="wd-ta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write roughly here. Punctuation can wait."
            style={{
              width: "100%", minHeight: 320, marginTop: 8, padding: 18, resize: "vertical",
              border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel,
              font: `400 16px/1.7 ${SERIF}`, color: C.ink, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 16, marginTop: 8, font: `400 12px ${MONO}`, color: C.muted }}>
            <span>{words} words</span><span>{chars} chars</span>
            {prev != null && (
              <button onClick={undo} style={{ marginLeft: "auto", background: "none", border: "none", color: C.pencil, cursor: "pointer", font: `400 12px ${MONO}`, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <RotateCcw size={13} /> undo replace
              </button>
            )}
          </div>

          {/* primary actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button className="wd-act" style={{ ...btn(false), borderColor: C.pencil, background: C.pencil, color: "#fff" }} onClick={proofread} disabled={busy}>
              {busy === "proof" ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Proofread
            </button>
            {REWRITES.map((a) => (
              <button key={a.id} className="wd-act" style={btn(false)} title={a.hint} onClick={() => rewrite(a)} disabled={busy}>
                {busy === a.id ? <Loader2 size={14} /> : null}{a.label}
              </button>
            ))}
          </div>
        </section>

        {/* editor's panel */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* tone */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, padding: 16 }}>
            <div style={{ font: `600 11px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Tone</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {TONES.map((t) => (
                <button key={t} className="wd-act" style={btn(tone === t)} onClick={() => setTone(t)}>{t}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn(false), flex: 1, justifyContent: "center" }} onClick={retone} disabled={busy}>
                {busy === "tone" ? <Loader2 size={14} /> : null} Rewrite as {tone.toLowerCase()}
              </button>
              <button style={btn(false)} onClick={detectTone} disabled={busy} title="How does my text come across?">
                {busy === "detect" ? <Loader2 size={14} /> : null} Detect
              </button>
            </div>
          </div>

          {/* custom */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, padding: 16 }}>
            <div style={{ font: `600 11px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Custom instruction</div>
            <input
              value={custom} onChange={(e) => setCustom(e.target.value)}
              placeholder='e.g. "make this sound less apologetic"'
              style={{ width: "100%", padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 7, font: `400 13px ${GROTESK}`, boxSizing: "border-box", marginBottom: 10 }}
            />
            <button style={{ ...btn(false), width: "100%", justifyContent: "center" }} onClick={customRun} disabled={busy || !custom.trim()}>
              {busy === "custom" ? <Loader2 size={14} /> : null} Apply instruction
            </button>
          </div>
        </aside>
      </div>

      {/* result ledger */}
      {(error || result) && (
        <div style={{ maxWidth: 1080, margin: "26px auto 0" }}>
          {error && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 14, border: `1px solid ${C.mark}`, background: C.markSoft, borderRadius: 10, color: C.mark, font: `500 14px ${GROTESK}` }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {result && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: C.paper }}>
                <span style={{ font: `600 12px ${MONO}`, letterSpacing: ".06em", textTransform: "uppercase", color: C.pencil }}>{result.title}</span>
                {result.kind === "rewrite" && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button style={btn(false)} onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
                    <button style={{ ...btn(false), borderColor: C.pencil, background: C.pencil, color: "#fff" }} onClick={apply}>Replace draft</button>
                  </div>
                )}
              </div>
              <p style={{ margin: 0, padding: 18, font: `400 ${result.kind === "note" ? 15 : 16}px/1.7 ${SERIF}`, color: C.ink, whiteSpace: "pre-wrap" }}>{result.text}</p>

              {marks && marks.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 16px" }}>
                  <div style={{ font: `600 11px ${MONO}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{marks.length} correction{marks.length > 1 ? "s" : ""}</div>
                  {marks.map((m, i) => (
                    <div key={i} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, padding: "6px 0", borderTop: i ? `1px dashed ${C.line}` : "none", font: `400 13px ${GROTESK}` }}>
                      <span style={{ textDecoration: "line-through", color: C.mark, background: C.markSoft, padding: "1px 6px", borderRadius: 4 }}>{m.before}</span>
                      <span style={{ color: C.muted }}>→</span>
                      <span style={{ color: C.pencil, background: C.pencilSoft, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>{m.after}</span>
                      <span style={{ color: C.muted, font: `400 12px ${GROTESK}` }}>{m.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {marks && marks.length === 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 18px", font: `400 13px ${GROTESK}`, color: C.muted }}>Clean — nothing to fix.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
