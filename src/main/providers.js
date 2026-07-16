import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getApiKey } from './keychain.js'
import { getSettings } from './settings.js'
import { noKey, normalizeError } from './provider-errors.js'

// ---- The single seam, now a small registry --------------------------------
// Every provider exposes the same contract: ask(prompt) -> string. Adding a
// provider is a new entry here and nothing else. Anthropic uses its native
// SDK; OpenAI / Groq / Gemini all speak the OpenAI chat-completions shape, so
// they share one client pointed at different base URLs.
//
// NOTE: default model ids below are best-effort and may be out of date — they
// are meant to be overridden from the in-app picker (or edited here).

const SYSTEM =
  'You are a precise copy editor. Follow the instruction exactly and return only ' +
  'what is asked — no preamble, no explanation, no markdown code fences.'

const REGISTRY = {
  anthropic: {
    label: 'Anthropic',
    kind: 'anthropic',
    defaultModel: 'claude-opus-4-8'
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai-compat',
    defaultModel: 'gpt-4.1',
    baseURL: undefined // default: api.openai.com
  },
  groq: {
    label: 'Groq',
    kind: 'openai-compat',
    defaultModel: 'llama-3.3-70b-versatile',
    baseURL: 'https://api.groq.com/openai/v1'
  },
  gemini: {
    label: 'Gemini',
    kind: 'openai-compat',
    defaultModel: 'gemini-2.0-flash',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
  }
}

// Metadata for the renderer's provider picker — no secrets, no client config.
export function listProviders() {
  return Object.entries(REGISTRY).map(([id, p]) => ({
    id,
    label: p.label,
    defaultModel: p.defaultModel
  }))
}

const DEFAULT_PROVIDER = Object.keys(REGISTRY)[0]

export function isValidProvider(id) {
  return Boolean(REGISTRY[id])
}

// Effective active selection for a model call — validated against REGISTRY.
// Falls back to the first provider / the provider's defaultModel when stored
// values are missing or stale.
export function resolveActive() {
  const { provider, models } = getSettings()
  const id = REGISTRY[provider] ? provider : DEFAULT_PROVIDER
  const model = (models?.[id] || '').trim() || REGISTRY[id].defaultModel
  return { provider: id, model }
}

// Renderer-facing view: the effective active provider id, plus an effective
// model string for every registry provider (stored value or defaultModel).
export function effectiveSettings() {
  const { provider, models } = getSettings()
  const active = REGISTRY[provider] ? provider : DEFAULT_PROVIDER
  const out = {}
  for (const [id, cfg] of Object.entries(REGISTRY)) {
    out[id] = (models?.[id] || '').trim() || cfg.defaultModel
  }
  return { provider: active, models: out }
}

async function askAnthropic({ apiKey, model, prompt }) {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  })
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

async function askOpenAICompat({ apiKey, model, prompt, baseURL }) {
  const client = new OpenAI({ apiKey, baseURL })
  // max_tokens is broadly supported across OpenAI/Groq/Gemini-compat. Some
  // newer OpenAI models want max_completion_tokens instead — swap if you hit that.
  const res = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt }
    ]
  })
  return (res.choices?.[0]?.message?.content || '').trim()
}

export async function ask({ provider, model, prompt }) {
  const cfg = REGISTRY[provider]
  if (!cfg) throw new Error(`Unknown provider: ${provider}`)

  const apiKey = await getApiKey(provider)
  if (!apiKey) throw noKey(cfg.label)

  const useModel = (model && model.trim()) || cfg.defaultModel
  try {
    if (cfg.kind === 'anthropic') {
      return await askAnthropic({ apiKey, model: useModel, prompt })
    }
    return await askOpenAICompat({ apiKey, model: useModel, prompt, baseURL: cfg.baseURL })
  } catch (e) {
    throw normalizeError(e, cfg.label, useModel)
  }
}
