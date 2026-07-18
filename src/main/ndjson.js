// Pure NDJSON stream parser — no electron imports, so it loads under plain
// `node --test`. The F1 helper streams one JSON event per line over stdout;
// stdout chunks split lines anywhere, so we buffer the trailing partial line
// until its newline arrives. Malformed lines are dropped silently (invisible
// failure per the phase-3 policy — a garbled event never crashes the consumer),
// blank lines are skipped. Groundwork for #54 (helper lifecycle).

export function createNdjsonParser() {
  let buffer = ''
  return {
    // Feed a stdout chunk (string or Buffer); returns the events completed by it.
    push(chunk) {
      buffer += String(chunk)
      const parts = buffer.split('\n')
      buffer = parts.pop()
      const out = []
      for (const line of parts) {
        const s = line.trim()
        if (!s) continue
        try {
          out.push(JSON.parse(s))
        } catch {
          // drop malformed line — a bad event must not surface or throw
        }
      }
      return out
    },
    reset() {
      buffer = ''
    }
  }
}
