// Pure whole-field read/verify/apply flow (#59, M3) — no electron imports, no
// real timers, so it loads under plain `node --test`. The wiring (follow-up
// card) provides the real seams: `send` writes NDJSON lines to the helper's
// stdin, `readValue`/`verifyFocus` go through the request channel, and
// `applyReplace` is the synthesized ⌘A+⌘V with clipboard snapshot/restore.
//
// Invariants (docs/phase3/anchored-icon.md §Invariants, §Text flow):
// - Secure fields are untouchable — a secure focus never reaches readValue.
// - Selection wins — a selection routes to the F5 clipboard path, never here.
// - No auto-apply — reading never applies; apply is a separate explicit call.
// - Apply always re-verifies the element read; anything but an explicit
//   `true` from verifyFocus (mismatch, error, helper gone) aborts the apply.

export const FIELD_CHANGED_NOTICE = 'field changed — nothing applied'

// Request/response correlation over the helper's stdin channel. Requests are
// one NDJSON line `{id, type, elementId}`; the helper answers with an event
// `{type:'response', id, ok, value}` on its stdout stream. Time is injected
// as `now` (ms) so tests drive expiry with plain numbers.
export function createRequestChannel({ send, timeoutMs = 3000 }) {
  let nextId = 1
  const pending = new Map()
  return {
    request(type, elementId, now) {
      return new Promise((resolve, reject) => {
        const id = nextId++
        try {
          send(JSON.stringify({ id, type, elementId }) + '\n')
        } catch (err) {
          reject(err)
          return
        }
        pending.set(id, { resolve, reject, deadline: now + timeoutMs })
      })
    },
    // Feed events from the NDJSON stream; returns true when the event settled
    // a pending request (so the caller can skip its normal event handling).
    handleEvent(evt) {
      if (evt?.type !== 'response' || !pending.has(evt.id)) return false
      const p = pending.get(evt.id)
      pending.delete(evt.id)
      if (evt.ok === false) p.reject(new Error(evt.error || 'helper error'))
      else p.resolve(evt.value)
      return true
    },
    // Periodic clock check — expire requests past their deadline.
    tick(now) {
      for (const [id, p] of pending) {
        if (now >= p.deadline) {
          pending.delete(id)
          p.reject(new Error('timeout'))
        }
      }
    },
    // The helper died/was killed — settle everything in flight.
    failAll(reason = 'helper gone') {
      for (const p of pending.values()) p.reject(new Error(reason))
      pending.clear()
    }
  }
}

// The review-then-apply state machine. `read` captures the element identity a
// value was read from; `apply` re-verifies that exact identity and replaces
// the field content once, or aborts with a notice. A session is single-shot:
// consumed by apply (success or abort) and reset by every read.
export function createWholeFieldFlow({ readValue, verifyFocus, applyReplace }) {
  let session = null
  return {
    async read(focus) {
      session = null
      if (!focus?.elementId) return { ok: false, reason: 'no-field' }
      if (focus.secure) return { ok: false, reason: 'secure' }
      if (focus.hasSelection) return { ok: false, reason: 'selection' }
      let text
      try {
        text = await readValue(focus.elementId)
      } catch {
        return { ok: false, reason: 'read-failed' }
      }
      session = { elementId: focus.elementId }
      return { ok: true, text }
    },
    async apply(text) {
      const s = session
      session = null
      if (!s) return { applied: false, reason: 'no-session' }
      let stillFocused = false
      try {
        stillFocused = (await verifyFocus(s.elementId)) === true
      } catch {
        stillFocused = false
      }
      if (!stillFocused) return { applied: false, reason: 'field-changed', notice: FIELD_CHANGED_NOTICE }
      try {
        await applyReplace(text)
      } catch {
        return { applied: false, reason: 'apply-failed' }
      }
      return { applied: true }
    }
  }
}
