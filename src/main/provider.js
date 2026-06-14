import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from './keychain.js'

// ---- The single seam ----------------------------------------------------
// Switching provider (OpenAI, Ollama, …) changes only this file. The rest of
// the app speaks `ask(prompt) -> string` and nothing else. Prompts are built
// upstream in transform.js and are provider-agnostic.

const MODEL = 'claude-opus-4-8'

const SYSTEM =
  'You are a precise copy editor. Follow the instruction exactly and return only ' +
  'what is asked — no preamble, no explanation, no markdown code fences.'

export async function ask(prompt) {
  const apiKey = await getApiKey()
  if (!apiKey) {
    const err = new Error('No API key set. Add your Anthropic API key to get started.')
    err.code = 'NO_KEY'
    throw err
  }

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  })

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}
