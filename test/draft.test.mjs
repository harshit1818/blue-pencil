import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadDraft, saveDraft, DRAFT_KEY, DEMO_TEXT } from '../src/renderer/src/draft.js'

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v))
  }
}

test('first run seeds the demo text', () => {
  assert.equal(loadDraft(fakeStorage()), DEMO_TEXT)
})

test('a saved draft survives relaunch instead of the demo seed (the #17 repro)', () => {
  const storage = fakeStorage()
  saveDraft(storage, 'my real writing')
  assert.equal(loadDraft(storage), 'my real writing')
})

test('a deliberately cleared draft stays empty — demo does not come back', () => {
  const storage = fakeStorage()
  saveDraft(storage, '')
  assert.equal(loadDraft(storage), '')
})

test('save failure (quota/unavailable) does not throw', () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    }
  }
  saveDraft(broken, 'x')
  assert.equal(loadDraft(broken), DEMO_TEXT)
})

test('draft key is stable', () => {
  assert.equal(DRAFT_KEY, 'bp.draft')
})
