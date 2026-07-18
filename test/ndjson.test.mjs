import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNdjsonParser } from '../src/main/ndjson.js'

test('parses whole lines in a single chunk', () => {
  const p = createNdjsonParser()
  const out = p.push('{"type":"focus"}\n{"type":"blur"}\n')
  assert.deepEqual(out, [{ type: 'focus' }, { type: 'blur' }])
})

test('buffers a partial line until its newline arrives', () => {
  const p = createNdjsonParser()
  assert.deepEqual(p.push('{"type":"foc'), [])
  assert.deepEqual(p.push('us"}\n'), [{ type: 'focus' }])
})

test('splits an event that arrives across three chunks', () => {
  const p = createNdjsonParser()
  assert.deepEqual(p.push('{"a"'), [])
  assert.deepEqual(p.push(':1'), [])
  assert.deepEqual(p.push('}\n'), [{ a: 1 }])
})

test('one chunk carrying several newlines yields all events, keeps the tail', () => {
  const p = createNdjsonParser()
  const out = p.push('{"a":1}\n{"b":2}\n{"c":')
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }])
  assert.deepEqual(p.push('3}\n'), [{ c: 3 }])
})

test('drops a malformed line without throwing and keeps its neighbours', () => {
  const p = createNdjsonParser()
  const out = p.push('{"ok":1}\nnot json{{\n{"ok":2}\n')
  assert.deepEqual(out, [{ ok: 1 }, { ok: 2 }])
})

test('skips blank and whitespace-only lines', () => {
  const p = createNdjsonParser()
  const out = p.push('\n  \n{"x":1}\n\n')
  assert.deepEqual(out, [{ x: 1 }])
})

test('accepts Buffer chunks', () => {
  const p = createNdjsonParser()
  const out = p.push(Buffer.from('{"n":9}\n'))
  assert.deepEqual(out, [{ n: 9 }])
})

test('reset() discards a buffered partial line', () => {
  const p = createNdjsonParser()
  p.push('{"half":')
  p.reset()
  assert.deepEqual(p.push('{"whole":1}\n'), [{ whole: 1 }])
})
