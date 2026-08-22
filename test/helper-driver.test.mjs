// Tests for the F2b driver (#78): the glue between the spawned helper binary,
// the NDJSON parser, and the lifecycle state machine. All effects are injected
// (spawnFn, now, isTrusted) so the real policy — spawn/respawn/giveup, R12/R13
// gating, event forwarding — is exercised without a process or a clock.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createHelperDriver } from '../src/main/helper-driver.js'

function fakeChild() {
  const c = /** @type {any} */ (new EventEmitter())
  c.stdout = new EventEmitter()
  c.stdin = { end: () => {} }
  c.killed = false
  c.kill = () => {
    c.killed = true
  }
  return c
}

function setup(overrides = {}) {
  const spawned = []
  let t = 0
  const driver = createHelperDriver({
    binaryPath: fileURLToPath(import.meta.url), // any existing file
    isTrusted: () => true,
    spawnFn: () => {
      const c = fakeChild()
      spawned.push(c)
      return c
    },
    now: () => t,
    tickMs: 1e9, // real interval never fires during a test
    ...overrides
  })
  return { driver, spawned, setNow: (v) => (t = v) }
}

test('start spawns the helper and forwards protocol events, not heartbeats', () => {
  const { driver, spawned } = setup()
  const got = []
  driver.subscribe((e) => got.push(e))
  assert.equal(driver.start(), true)
  assert.equal(spawned.length, 1)
  spawned[0].stdout.emit(
    'data',
    '{"type":"focus","role":"AXTextArea"}\n{"type":"heartbeat"}\n{"type":"blur"}\n'
  )
  assert.deepEqual(
    got.map((e) => e.type),
    ['focus', 'blur']
  )
})

test('R13: never spawns when accessibility is not trusted', () => {
  const { driver, spawned } = setup({ isTrusted: () => false })
  assert.equal(driver.start(), false)
  assert.equal(spawned.length, 0)
})

test('never spawns when the binary is missing (invisible failure)', () => {
  const { driver, spawned } = setup({ binaryPath: '/nonexistent/ax-helper' })
  assert.equal(driver.start(), false)
  assert.equal(spawned.length, 0)
})

test('a crash respawns with backoff and gives up after the attempt budget', () => {
  const { driver, spawned, setNow } = setup()
  driver.start() // spawn 1
  spawned[0].emit('exit') // fail 1 → backoff 500
  driver.tick()
  assert.equal(spawned.length, 1, 'respawn must wait out the backoff')
  setNow(500)
  driver.tick() // spawn 2
  spawned[1].emit('exit') // fail 2 → backoff 1000
  setNow(1500)
  driver.tick() // spawn 3
  spawned[2].emit('exit') // fail 3 → backoff 2000
  setNow(3500)
  driver.tick() // spawn 4
  spawned[3].emit('exit') // fail 4 → give up
  setNow(1e8)
  driver.tick()
  assert.equal(spawned.length, 4, 'gave up — no fifth spawn')
})

test('a stale heartbeat kills the hung helper and respawns', () => {
  const { driver, spawned, setNow } = setup()
  driver.start()
  setNow(3000)
  spawned[0].stdout.emit('data', '{"type":"heartbeat"}\n')
  setNow(8000)
  driver.tick() // 5s since beat — inside the 6s budget
  assert.equal(spawned[0].killed, false)
  setNow(9001)
  driver.tick() // 6.001s — stale
  assert.equal(spawned[0].killed, true)
  spawned[0].emit('exit') // the killed process exits; must not burn an attempt
  setNow(9501)
  driver.tick()
  assert.equal(spawned.length, 2, 'respawned after backoff')
  spawned[1].emit('exit')
  setNow(9501 + 1000)
  driver.tick()
  assert.equal(spawned.length, 3, 'kill-exit did not consume the attempt budget')
})

test('stop kills the helper and blocks any respawn', () => {
  const { driver, spawned, setNow } = setup()
  driver.start()
  driver.stop()
  assert.equal(spawned[0].killed, true)
  spawned[0].emit('exit')
  setNow(1e8)
  driver.tick()
  assert.equal(spawned.length, 1)
})

test('a throwing subscriber never breaks delivery to the others', () => {
  const { driver, spawned } = setup()
  const got = []
  driver.subscribe(() => {
    throw new Error('bad subscriber')
  })
  driver.subscribe((e) => got.push(e))
  driver.start()
  spawned[0].stdout.emit('data', '{"type":"focus"}\n')
  assert.equal(got.length, 1)
})

test('each spawn passes fresh args from the injected provider (helper denylist)', () => {
  const argCalls = []
  let list = ['com.apple.Terminal']
  const spawnedKids = []
  let t = 0
  const driver = createHelperDriver({
    binaryPath: fileURLToPath(import.meta.url),
    isTrusted: () => true,
    args: () => list,
    spawnFn: (_path, args) => {
      argCalls.push(args)
      const c = fakeChild()
      spawnedKids.push(c)
      return c
    },
    now: () => t,
    tickMs: 1e9
  })
  driver.start()
  assert.deepEqual(argCalls[0], ['com.apple.Terminal'])
  list = ['com.apple.Terminal', 'com.microsoft.VSCode']
  spawnedKids[0].emit('exit')
  t = 500
  driver.tick()
  assert.deepEqual(argCalls[1], list, 'a respawn must re-read the provider, not reuse stale args')
})

test('output from a replaced child is ignored', () => {
  const { driver, spawned, setNow } = setup()
  const got = []
  driver.subscribe((e) => got.push(e))
  driver.start()
  const old = spawned[0]
  old.emit('exit')
  setNow(500)
  driver.tick() // respawn
  old.stdout.emit('data', '{"type":"focus"}\n')
  assert.equal(got.length, 0, 'stale child stdout must not reach subscribers')
})
