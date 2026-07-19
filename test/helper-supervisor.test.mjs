// F2b glue (#78): the supervisor wires spawn → ndjson parser → lifecycle and
// exposes an in-main subscription seam. Everything is injected (spawn fn,
// permission check, clock, interval fns) so the whole loop runs under plain
// `node --test` with no electron and no real timers. R12: every failure path
// is silent — nothing here may throw. R13: no spawn without permission.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHelperSupervisor, TICK_MS } from '../src/main/helper-supervisor.js'
import { createLifecycle } from '../src/main/helper-lifecycle.js'

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new EventEmitter()
    this.killed = false
  }
  kill() {
    this.killed = true
  }
}

/** @param {{ granted?: boolean, spawnImpl?: () => any }} [opts] */
function harness({ granted = true, spawnImpl } = {}) {
  const h = {
    t: 0,
    children: [],
    events: [],
    intervalCb: null,
    intervalMs: null,
    cleared: false
  }
  const sup = createHelperSupervisor({
    spawn:
      spawnImpl ||
      (() => {
        const c = new FakeChild()
        h.children.push(c)
        return c
      }),
    isGranted: () => granted,
    now: () => h.t,
    timers: {
      setInterval: (cb, ms) => {
        h.intervalCb = cb
        h.intervalMs = ms
        return 1
      },
      clearInterval: () => {
        h.cleared = true
      }
    }
  })
  sup.on((evt) => h.events.push(evt))
  h.sup = sup
  return h
}

test('R13: does not spawn (or start ticking) without accessibility permission', () => {
  const h = harness({ granted: false })
  assert.equal(h.sup.start(), false)
  assert.equal(h.children.length, 0)
  assert.equal(h.intervalCb, null)
})

test('start spawns the helper and parsed events reach subscribers across chunk splits', () => {
  const h = harness()
  assert.equal(h.sup.start(), true)
  assert.equal(h.children.length, 1)
  assert.equal(h.intervalMs, TICK_MS)
  h.children[0].stdout.emit('data', '{"type":"foc')
  h.children[0].stdout.emit('data', 'us","bundleId":"com.x"}\n')
  assert.deepEqual(h.events, [{ type: 'focus', bundleId: 'com.x' }])
})

test('crash respawns with backoff, and the 4th failure gives up silently (R12)', () => {
  const h = harness()
  h.sup.start()
  // failures at t=0, 500, 1500, 3500 (default 500ms base, x2 backoff)
  for (const t of [0, 500, 1500]) {
    h.t = t
    h.children.at(-1).emit('exit', 1)
    h.t = t === 0 ? 500 : t === 500 ? 1500 : 3500
    h.intervalCb()
  }
  assert.equal(h.children.length, 4)
  h.t = 3500
  h.children.at(-1).emit('exit', 1) // 4th failure → give up
  h.t = 100000
  h.intervalCb()
  assert.equal(h.children.length, 4, 'gave up — no more spawns')
})

test('a stale heartbeat kills and respawns; a live heartbeat does not', () => {
  const h = harness()
  h.sup.start()
  h.children[0].stdout.emit('data', '{"type":"heartbeat"}\n')
  h.t = 5000
  h.children[0].stdout.emit('data', '{"type":"heartbeat"}\n')
  h.t = 9000 // 4s since last beat < 6s timeout
  h.intervalCb()
  assert.equal(h.children[0].killed, false)
  h.t = 12000 // 7s since last beat → stale
  h.intervalCb()
  assert.equal(h.children[0].killed, true)
  h.children[0].emit('exit', null) // the exit from our own kill must not double-count
  h.t = 12500
  h.intervalCb()
  assert.equal(h.children.length, 2)
})

test('helper death emits a synthetic blur so a visible icon hides (R12)', () => {
  const h = harness()
  h.sup.start()
  h.children[0].stdout.emit('data', '{"type":"focus","bundleId":"com.x"}\n')
  h.children[0].emit('exit', 1)
  assert.deepEqual(h.events.at(-1), { type: 'blur' })
})

test("a child 'error' plus a later 'exit' counts as one failure", () => {
  const h = harness()
  h.sup.start()
  h.children[0].emit('error', new Error('ENOENT'))
  h.children[0].emit('exit', 1)
  h.t = 500 // one failure → first backoff slot
  h.intervalCb()
  assert.equal(h.children.length, 2)
})

test('a spawn that throws is a silent failure, not a crash (R12)', () => {
  const h = harness({
    spawnImpl: () => {
      throw new Error('spawn ENOENT')
    }
  })
  assert.doesNotThrow(() => h.sup.start())
})

test('a throwing subscriber never breaks the stream (R12)', () => {
  const h = harness()
  h.sup.on(() => {
    throw new Error('listener bug')
  })
  h.sup.start()
  assert.doesNotThrow(() => h.children[0].stdout.emit('data', '{"type":"focus"}\n{"type":"bounds"}\n'))
  assert.equal(h.events.length, 2, 'later listeners and events still delivered')
})

test("a killed child's late stdout is ignored — no ghost events, no heartbeat (R12)", () => {
  const children = []
  const events = []
  let heartbeats = 0
  const real = createLifecycle()
  const sup = createHelperSupervisor({
    spawn: () => {
      const c = new FakeChild()
      children.push(c)
      return c
    },
    isGranted: () => true,
    now: () => 0,
    timers: { setInterval: () => 1, clearInterval: () => {} },
    lifecycle: {
      get state() {
        return real.state
      },
      start: real.start,
      exit: real.exit,
      tick: real.tick,
      heartbeat: (t) => {
        heartbeats++
        return real.heartbeat(t)
      }
    }
  })
  sup.on((evt) => events.push(evt))
  sup.start()
  sup.stop() // kills + detaches the child; SIGTERM may still be in flight
  const seen = events.length
  children[0].stdout.emit('data', '{"type":"focus","bundleId":"com.x"}\n{"type":"heartbeat"}\n')
  assert.equal(events.length, seen, 'no events from a detached child')
  assert.equal(heartbeats, 0, 'no heartbeat from a detached child')
})

test('start() while already running is a no-op — no duplicate helper', () => {
  const h = harness()
  assert.equal(h.sup.start(), true)
  assert.equal(h.sup.start(), true)
  assert.equal(h.children.length, 1)
})

test('stop kills the child, clears the interval, and ignores the resulting exit', () => {
  const h = harness()
  h.sup.start()
  h.sup.stop()
  assert.equal(h.children[0].killed, true)
  assert.equal(h.cleared, true)
  assert.doesNotThrow(() => h.children[0].emit('exit', null))
})
