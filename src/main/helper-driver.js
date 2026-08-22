// F2b (#78): drives the AX helper process through the pure lifecycle machine.
// No electron imports — spawn, clock, and the trust check are injected, so the
// whole spawn/respawn/giveup policy runs under plain `node --test`. index.js
// supplies the real ones (child_process.spawn, isTrustedAccessibilityClient).
//
// R12: every failure path here is silent — no dialogs, no throws out of the
// driver; a dead or hung helper degrades to "no events", which downstream
// means "no icon". R13: start() refuses to spawn without the Accessibility
// grant (the injected check must never prompt).

import { spawn as nodeSpawn } from 'child_process'
import { existsSync } from 'fs'
import { createNdjsonParser } from './ndjson.js'
import { createLifecycle } from './helper-lifecycle.js'

const TICK_MS = 1000

/**
 * @param {{
 *   binaryPath: string,
 *   isTrusted: () => boolean,
 *   args?: () => string[],
 *   spawnFn?: (path: string, args: string[], opts: object) => any,
 *   now?: () => number,
 *   tickMs?: number
 * }} opts
 */
export function createHelperDriver({
  binaryPath,
  isTrusted,
  args = () => [],
  spawnFn = nodeSpawn,
  now = Date.now,
  tickMs = TICK_MS
}) {
  const lifecycle = createLifecycle()
  const parser = createNdjsonParser()
  const subscribers = new Set()
  let child = null
  let interval = null
  let stopped = false

  function emit(evt) {
    for (const fn of subscribers) {
      try {
        fn(evt)
      } catch {
        // a bad subscriber must not break the stream or the siblings
      }
    }
  }

  function apply(actions) {
    for (const a of actions) {
      if (a === 'spawn') doSpawn()
      else if (a === 'kill' || a === 'giveup') doKill()
    }
  }

  function doSpawn() {
    parser.reset()
    let c
    try {
      // args() is re-read on every (re)spawn so a settings change (denylist)
      // reaches the helper at the next respawn without extra plumbing
      c = spawnFn(binaryPath, args(), { stdio: ['pipe', 'pipe', 'ignore'] })
    } catch {
      // treat a spawn refusal like an instant crash — backoff handles the rest
      apply(lifecycle.exit(now()))
      return
    }
    child = c
    // 'error' (e.g. ENOENT) may fire without 'exit'; the child guard dedupes.
    c.on('error', () => onExit(c))
    c.on('exit', () => onExit(c))
    c.stdout.on('data', (chunk) => {
      if (child !== c) return // a replaced child's buffered output is stale
      for (const evt of parser.push(chunk)) {
        if (evt.type === 'heartbeat') apply(lifecycle.heartbeat(now()))
        else emit(evt)
      }
    })
    // the helper exits when its stdin closes — hold it open for its lifetime
  }

  function doKill() {
    if (child) child.kill()
  }

  function onExit(c) {
    if (child !== c) return
    child = null
    if (!stopped) apply(lifecycle.exit(now()))
  }

  return {
    // begin the lifecycle; false (and no spawn, no prompt) when the
    // Accessibility grant or the binary itself is missing
    start() {
      if (!isTrusted() || !existsSync(binaryPath)) return false
      stopped = false
      apply(lifecycle.start(now()))
      clearInterval(interval)
      interval = setInterval(() => apply(lifecycle.tick(now())), tickMs)
      interval.unref?.()
      return true
    },
    stop() {
      stopped = true
      clearInterval(interval)
      doKill()
      child = null
    },
    // clock check, also callable directly by tests — start() runs it on tickMs
    tick() {
      apply(lifecycle.tick(now()))
    },
    subscribe(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    get status() {
      return lifecycle.state.status
    }
  }
}
