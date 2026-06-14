import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getApiKey } from './keychain.js'

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

function noKey(provider) {
  const err = new Error(`No API key set for ${REGISTRY[provider]?.label || provider}. Add the key to get started.`)
  err.code = 'NO_KEY'
  return err
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
  if (!apiKey) throw noKey(provider)

  const useModel = (model && model.trim()) || cfg.defaultModel
  if (cfg.kind === 'anthropic') {
    return askAnthropic({ apiKey, model: useModel, prompt })
  }
  return askOpenAICompat({ apiKey, model: useModel, prompt, baseURL: cfg.baseURL })
}
