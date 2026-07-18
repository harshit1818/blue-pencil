import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLifecycle } from '../src/main/helper-lifecycle.js'

const cfg = { maxAttempts: 3, backoffBaseMs: 500, backoffFactor: 2, heartbeatTimeoutMs: 6000 }

test('start spawns and marks running', () => {
  const lc = createLifecycle(cfg)
  assert.deepEqual(lc.start(0), ['spawn'])
  assert.equal(lc.state.status, 'running')
})

test('exponential backoff schedule across three respawn attempts', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)

  assert.deepEqual(lc.exit(1000), []) // attempt 1
  assert.equal(lc.state.status, 'backoff')
  assert.equal(lc.state.respawnAt, 1000 + 500)
  assert.deepEqual(lc.tick(1000 + 500), ['spawn']) // respawn 1

  assert.deepEqual(lc.exit(3000), []) // attempt 2
  assert.equal(lc.state.respawnAt, 3000 + 1000)
  assert.deepEqual(lc.tick(3000 + 1000), ['spawn']) // respawn 2

  assert.deepEqual(lc.exit(9000), []) // attempt 3
  assert.equal(lc.state.respawnAt, 9000 + 2000)
  assert.deepEqual(lc.tick(9000 + 2000), ['spawn']) // respawn 3
})

test('gives up after the fourth crash and stays given up', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  lc.exit(1); lc.tick(lc.state.respawnAt)
  lc.exit(2); lc.tick(lc.state.respawnAt)
  lc.exit(3); lc.tick(lc.state.respawnAt)
  assert.deepEqual(lc.exit(4), ['giveup'])
  assert.equal(lc.state.status, 'gaveup')
  // a later tick never respawns once given up
  assert.deepEqual(lc.tick(1e9), [])
})

test('tick before respawnAt does nothing; at/after it respawns', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  lc.exit(0)
  assert.deepEqual(lc.tick(499), [])
  assert.deepEqual(lc.tick(500), ['spawn'])
})

test('heartbeat keeps the helper alive so tick stays quiet', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  lc.heartbeat(5000)
  assert.deepEqual(lc.tick(10000), []) // 5000 since last beat, under 6000 timeout
  assert.equal(lc.state.status, 'running')
})

test('stale heartbeat kills and schedules a respawn', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  assert.deepEqual(lc.tick(6001), ['kill']) // no beat for >6000ms
  assert.equal(lc.state.status, 'backoff')
  assert.equal(lc.state.attempts, 1)
})

test('exit after a stale kill is ignored (no double count)', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  lc.tick(6001) // stale → kill, attempts=1, backoff
  assert.deepEqual(lc.exit(6002), []) // the killed process exiting must not re-count
  assert.equal(lc.state.attempts, 1)
})

test('start resets the attempt budget after a give-up', () => {
  const lc = createLifecycle(cfg)
  lc.start(0)
  lc.exit(1); lc.tick(lc.state.respawnAt)
  lc.exit(2); lc.tick(lc.state.respawnAt)
  lc.exit(3); lc.tick(lc.state.respawnAt)
  lc.exit(4)
  assert.equal(lc.state.status, 'gaveup')
  assert.deepEqual(lc.start(1e6), ['spawn'])
  assert.equal(lc.state.attempts, 0)
  assert.equal(lc.state.status, 'running')
})

test('stray heartbeat while not running is ignored', () => {
  const lc = createLifecycle(cfg)
  assert.deepEqual(lc.heartbeat(100), [])
  assert.equal(lc.state.status, 'idle')
})
