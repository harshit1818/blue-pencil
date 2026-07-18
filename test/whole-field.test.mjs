import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequestChannel, createWholeFieldFlow, FIELD_CHANGED_NOTICE } from '../src/main/whole-field.js'

// ---- request channel -------------------------------------------------------

function channel(opts = {}) {
  const sent = []
  const ch = createRequestChannel({ send: (line) => sent.push(line), timeoutMs: 1000, ...opts })
  return { ch, sent }
}

test('request writes one NDJSON line with id/type/elementId', () => {
  const { ch, sent } = channel()
  ch.request('readValue', 'el-1', 0).catch(() => {})
  assert.equal(sent.length, 1)
  assert.ok(sent[0].endsWith('\n'))
  assert.deepEqual(JSON.parse(sent[0]), { id: 1, type: 'readValue', elementId: 'el-1' })
})

test('matching response resolves with its value', async () => {
  const { ch } = channel()
  const p = ch.request('readValue', 'el-1', 0)
  assert.equal(ch.handleEvent({ type: 'response', id: 1, ok: true, value: 'draft text' }), true)
  assert.equal(await p, 'draft text')
})

test('interleaved responses settle the right requests by id', async () => {
  const { ch } = channel()
  const a = ch.request('readValue', 'el-a', 0)
  const b = ch.request('verifyFocus', 'el-b', 0)
  ch.handleEvent({ type: 'response', id: 2, ok: true, value: true })
  ch.handleEvent({ type: 'response', id: 1, ok: true, value: 'text-a' })
  assert.equal(await a, 'text-a')
  assert.equal(await b, true)
})

test('ok:false response rejects', async () => {
  const { ch } = channel()
  const p = ch.request('readValue', 'el-1', 0)
  ch.handleEvent({ type: 'response', id: 1, ok: false, error: 'no such element' })
  await assert.rejects(p, /no such element/)
})

test('non-response and unknown-id events are ignored', () => {
  const { ch } = channel()
  ch.request('readValue', 'el-1', 0).catch(() => {})
  assert.equal(ch.handleEvent({ type: 'focus', elementId: 'el-2' }), false)
  assert.equal(ch.handleEvent({ type: 'response', id: 99, ok: true }), false)
})

test('a tick before the deadline leaves the request pending', async () => {
  const { ch } = channel()
  const p = ch.request('readValue', 'el-1', 0)
  ch.tick(999)
  assert.equal(ch.handleEvent({ type: 'response', id: 1, ok: true, value: 'x' }), true)
  assert.equal(await p, 'x')
})

test('a tick at the deadline rejects with timeout', async () => {
  const { ch } = channel()
  const p = ch.request('readValue', 'el-1', 0)
  ch.tick(1000)
  await assert.rejects(p, /timeout/)
  assert.equal(ch.handleEvent({ type: 'response', id: 1, ok: true, value: 'late' }), false)
})

test('request without a finite now throws instead of silently disabling the timeout', () => {
  const { ch, sent } = channel()
  assert.throws(() => ch.request('readValue', 'el-1'), /finite/)
  assert.equal(sent.length, 0)
})

test('failAll rejects everything in flight', async () => {
  const { ch } = channel()
  const a = ch.request('readValue', 'el-1', 0)
  const b = ch.request('verifyFocus', 'el-1', 0)
  ch.failAll()
  await assert.rejects(a, /helper gone/)
  await assert.rejects(b, /helper gone/)
})

test('a throwing send rejects immediately without leaving a pending request', async () => {
  const ch = createRequestChannel({
    send: () => {
      throw new Error('stdin closed')
    }
  })
  await assert.rejects(ch.request('readValue', 'el-1', 0), /stdin closed/)
  assert.equal(ch.handleEvent({ type: 'response', id: 1, ok: true }), false)
})

// ---- whole-field flow ------------------------------------------------------

function flow(overrides = {}) {
  const calls = { read: [], verify: [], apply: [] }
  const f = createWholeFieldFlow({
    readValue: async (id) => {
      calls.read.push(id)
      return 'the whole draft'
    },
    verifyFocus: async (id) => {
      calls.verify.push(id)
      return true
    },
    applyReplace: async (text) => {
      calls.apply.push(text)
    },
    ...overrides
  })
  return { f, calls }
}

const focus = (extra = {}) => ({ elementId: 'el-1', secure: false, hasSelection: false, ...extra })

test('R8: no selection → whole field is read from the focused element', async () => {
  const { f, calls } = flow()
  assert.deepEqual(await f.read(focus()), { ok: true, text: 'the whole draft' })
  assert.deepEqual(calls.read, ['el-1'])
})

test('R2: secure field never reaches readValue', async () => {
  const { f, calls } = flow()
  assert.deepEqual(await f.read(focus({ secure: true })), { ok: false, reason: 'secure' })
  assert.equal(calls.read.length, 0)
})

test('selection wins: a selection is refused here (F5 path handles it)', async () => {
  const { f, calls } = flow()
  assert.deepEqual(await f.read(focus({ hasSelection: true })), { ok: false, reason: 'selection' })
  assert.equal(calls.read.length, 0)
})

test('no focused element → no read', async () => {
  const { f, calls } = flow()
  assert.deepEqual(await f.read(null), { ok: false, reason: 'no-field' })
  assert.equal(calls.read.length, 0)
})

test('R9: apply re-verifies the element read, then replaces exactly once', async () => {
  const { f, calls } = flow()
  await f.read(focus())
  assert.deepEqual(await f.apply('rewritten'), { applied: true })
  assert.deepEqual(calls.verify, ['el-1'])
  assert.deepEqual(calls.apply, ['rewritten'])
})

test('no auto-apply: reading alone never calls applyReplace', async () => {
  const { f, calls } = flow()
  await f.read(focus())
  assert.equal(calls.apply.length, 0)
})

test('apply without a prior read is a no-op', async () => {
  const { f, calls } = flow()
  assert.deepEqual(await f.apply('text'), { applied: false, reason: 'no-session' })
  assert.equal(calls.apply.length, 0)
})

test('R10: focus moved between read and apply → nothing applied, notice shown', async () => {
  const { f, calls } = flow({ verifyFocus: async () => false })
  await f.read(focus())
  const r = await f.apply('rewritten')
  assert.deepEqual(r, { applied: false, reason: 'field-changed', notice: FIELD_CHANGED_NOTICE })
  assert.equal(calls.apply.length, 0)
})

test('a failing verifyFocus counts as mismatch — never apply into an unverified target', async () => {
  const { f, calls } = flow({
    verifyFocus: async () => {
      throw new Error('helper gone')
    }
  })
  await f.read(focus())
  assert.equal((await f.apply('rewritten')).applied, false)
  assert.equal(calls.apply.length, 0)
})

test('a truthy-but-not-true verify answer counts as mismatch', async () => {
  const { f, calls } = flow({ verifyFocus: async () => 'yes' })
  await f.read(focus())
  assert.equal((await f.apply('rewritten')).applied, false)
  assert.equal(calls.apply.length, 0)
})

test('a session is single-shot: a second apply after success is a no-op', async () => {
  const { f, calls } = flow()
  await f.read(focus())
  await f.apply('rewritten')
  assert.deepEqual(await f.apply('again'), { applied: false, reason: 'no-session' })
  assert.equal(calls.apply.length, 1)
})

test('an aborted apply also consumes the session', async () => {
  const { f, calls } = flow({ verifyFocus: async () => false })
  await f.read(focus())
  await f.apply('rewritten')
  assert.deepEqual(await f.apply('rewritten'), { applied: false, reason: 'no-session' })
  assert.equal(calls.apply.length, 0)
})

test('a failed read leaves no session behind', async () => {
  const { f, calls } = flow({
    readValue: async () => {
      throw new Error('AX error')
    }
  })
  assert.deepEqual(await f.read(focus()), { ok: false, reason: 'read-failed' })
  assert.deepEqual(await f.apply('text'), { applied: false, reason: 'no-session' })
  assert.equal(calls.apply.length, 0)
})

test('re-reading rebinds the session to the new element identity', async () => {
  const { f, calls } = flow()
  await f.read(focus())
  await f.read(focus({ elementId: 'el-2' }))
  await f.apply('rewritten')
  assert.deepEqual(calls.verify, ['el-2'])
})

test('overlapping reads: the older read resolving last cannot rebind the session', async () => {
  const resolvers = new Map()
  const verified = []
  const f = createWholeFieldFlow({
    readValue: (id) => new Promise((resolve) => resolvers.set(id, resolve)),
    verifyFocus: async (id) => {
      verified.push(id)
      return true
    },
    applyReplace: async () => {}
  })
  const a = f.read(focus({ elementId: 'el-a' }))
  const b = f.read(focus({ elementId: 'el-b' }))
  resolvers.get('el-b')('text-b')
  assert.deepEqual(await b, { ok: true, text: 'text-b' })
  resolvers.get('el-a')('text-a')
  assert.deepEqual(await a, { ok: false, reason: 'stale-read' })
  assert.deepEqual(await f.apply('rewritten'), { applied: true })
  assert.deepEqual(verified, ['el-b'])
})

test('a failing applyReplace is reported, not thrown', async () => {
  const { f } = flow({
    applyReplace: async () => {
      throw new Error('paste failed')
    }
  })
  await f.read(focus())
  assert.deepEqual(await f.apply('rewritten'), { applied: false, reason: 'apply-failed' })
})
