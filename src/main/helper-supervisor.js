// F2b glue (#78): drives the pure lifecycle machine and NDJSON parser around a
// real (injected) spawn. Owns the tick interval; applies the machine's
// spawn/kill/giveup actions; fans parsed helper events out to in-main
// subscribers (the seam ghost-icon.js consumes). Failure policy is R12:
// nothing in here throws, dialogs, or logs at the user — a dead helper just
// stops producing events (after a synthetic blur so no stale icon lingers).
// R13 lives at start(): no permission → no spawn, and the check is the
// caller-supplied non-prompting one.

import { createNdjsonParser } from './ndjson.js'
import { createLifecycle } from './helper-lifecycle.js'

export const TICK_MS = 1000

/**
 * @param {object} opts
 * @param {() => any} opts.spawn
 * @param {() => boolean} opts.isGranted
 * @param {() => number} [opts.now]
 * @param {{ setInterval: (cb: () => void, ms: number) => any, clearInterval: (id: any) => void }} [opts.timers]
 * @param {ReturnType<typeof createLifecycle>} [opts.lifecycle]
 */
export function createHelperSupervisor({
  spawn,
  isGranted,
  now = Date.now,
  timers = { setInterval, clearInterval },
  lifecycle = createLifecycle()
}) {
  const parser = createNdjsonParser()
  const listeners = new Set()
  let child = null
  let interval = null

  const emit = (evt) => {
    for (const fn of listeners) {
      try {
        fn(evt)
      } catch {
        // a buggy subscriber must not break the stream (R12)
      }
    }
  }

  const apply = (actions) => {
    for (const a of actions) {
      if (a === 'spawn') doSpawn()
      else if (a === 'kill') doKill()
      // 'giveup' is deliberately silent: icon absent, app unaffected (R12)
    }
  }

  function doKill() {
    const c = child
    child = null // detach first so the kill's own exit event is ignored
    try {
      c?.kill()
    } catch {
      /* already gone */
    }
    emit({ type: 'blur' })
  }

  function doSpawn() {
    parser.reset()
    let c = null
    try {
      c = spawn()
    } catch {
      c = null
    }
    if (!c) {
      apply(lifecycle.exit(now()))
      return
    }
    child = c
    let settled = false
    const died = () => {
      // 'error' and 'exit' can both fire (ENOENT), and our own kill/stop also
      // produces an exit — count each child's death once, and never a detached one
      if (settled || child !== c) return
      settled = true
      child = null
      emit({ type: 'blur' })
      apply(lifecycle.exit(now()))
    }
    c.on('error', died)
    c.on('exit', died)
    c.stdout?.on('data', (chunk) => {
      for (const evt of parser.push(chunk)) {
        if (evt?.type === 'heartbeat') lifecycle.heartbeat(now())
        emit(evt)
      }
    })
  }

  return {
    on(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    start() {
      if (!isGranted()) return false
      apply(lifecycle.start(now()))
      interval ??= timers.setInterval(() => apply(lifecycle.tick(now())), TICK_MS)
      return true
    },
    stop() {
      if (interval != null) timers.clearInterval(interval)
      interval = null
      if (child) doKill()
    }
  }
}
