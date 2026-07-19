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
      // A forgotten `now` would make the deadline NaN and silently disable
      // the timeout — fail loudly at the call site instead.
      if (!Number.isFinite(now)) throw new TypeError('request() needs a finite `now` (ms)')
      return new Promise((resolve, reject) => {
        const id = nextId++
        // Register before send so a transport that answers synchronously
        // from within send() still finds the pending entry.
        pending.set(id, { resolve, reject, deadline: now + timeoutMs })
        try {
          send(JSON.stringify({ id, type, elementId }) + '\n')
        } catch (err) {
          pending.delete(id)
          reject(err)
        }
      })
    },
    // Feed events from the NDJSON stream; returns true when the event settled
    // a pending request (so the caller can skip its normal event handling).
    handleEvent(evt) {
      if (evt?.type !== 'response' || !pending.has(evt.id)) return false
      const p = pending.get(evt.id)
      pending.delete(evt.id)
      if (evt.ok === true) p.resolve(evt.value)
      else p.reject(new Error(evt.error || 'helper error'))
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
  let readGen = 0
  return {
    async read(focus) {
      session = null
      // Bump on every entry (refusals included) so an older in-flight read
      // can't resurrect a session a refusing read just cleared.
      const gen = ++readGen
      if (!focus?.elementId) return { ok: false, reason: 'no-field' }
      if (focus.secure) return { ok: false, reason: 'secure' }
      if (focus.hasSelection) return { ok: false, reason: 'selection' }
      let text
      try {
        text = await readValue(focus.elementId)
      } catch {
        return { ok: false, reason: 'read-failed' }
      }
      // A newer read started while we awaited — this result is stale and must
      // not rebind the session to the older element.
      if (gen !== readGen) return { ok: false, reason: 'stale-read' }
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
