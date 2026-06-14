import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, renameSync } from 'fs'

// Persistence only — NO defaults, NO validation (providers.js owns the registry
// and therefore owns "what's valid / what's the default"). This file is dumb
// storage and holds NO SECRETS: API keys live in the macOS Keychain. settings.json
// carries only the active provider id and per-provider model strings.
//
// shape: { provider: string | null, models: { [providerId]: string } }

function file() {
  return join(app.getPath('userData'), 'settings.json')
}

let cache = null

function load() {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8'))
    cache = {
      provider: typeof raw.provider === 'string' ? raw.provider : null,
      models: raw.models && typeof raw.models === 'object' ? raw.models : {}
    }
  } catch {
    cache = { provider: null, models: {} }
  }
  return cache
}

function persist(next) {
  cache = next
  try {
    const tmp = file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2))
    renameSync(tmp, file()) // atomic replace
  } catch {
    /* best-effort */
  }
}

export function getSettings() {
  return load()
}

export function setProviderId(id) {
  persist({ ...load(), provider: id })
  return cache
}

export function setModelId(providerId, model) {
  const cur = load()
  persist({ ...cur, models: { ...cur.models, [providerId]: (model || '').trim() } })
  return cache
}
