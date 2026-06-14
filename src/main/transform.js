import { ask, resolveActive } from './providers.js'

// Prompt construction lives here, between the IPC handler and the provider
// registry. The renderer sends only a semantic action; the active provider and
// model are resolved here from the main-process settings — never prompt text.
// (This is what lets a second window — the future overlay — request a transform
// knowing nothing but the action.)

const REWRITE_INSTRUCTIONS = {
  improve: 'Revise to improve clarity, flow and word choice while preserving meaning and voice.',
  simplify: 'Rewrite so it is clear and easy to read; cut unnecessary words.',
  summarize: 'Summarize concisely in the same voice.'
}

const REWRITE_TITLES = {
  improve: 'Improve',
  simplify: 'Simplify',
  summarize: 'Summarize'
}

// Pull the first {...} object out of a model reply, tolerating code fences or
// surrounding prose. Throws if there's no object to parse.
function parseJsonObject(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object found')
  return JSON.parse(raw.slice(start, end + 1))
}

// payload: { text, action: 'proofread'|'improve'|'simplify'|'summarize'|'tone', tone? }
// returns: { kind: 'proofread'|'rewrite', title, text, changes? }
export async function transform({ text, action, tone } = {}) {
  const input = (text || '').trim()
  if (!input) throw new Error('Nothing to transform.')

  const { provider, model } = resolveActive()
  const call = (prompt) => ask({ provider, model, prompt })

  if (action === 'proofread') {
    const raw = await call(
      'You are a copy editor. Correct spelling, grammar and punctuation in the text below. ' +
        'Respond ONLY with minified JSON shaped ' +
        '{"corrected":string,"changes":[{"before":string,"after":string,"reason":string}]}. ' +
        'Use an empty changes array if the text is already clean.\n\n' +
        `Text:\n"""${input}"""`
    )
    try {
      const parsed = parseJsonObject(raw)
      return {
        kind: 'proofread',
        title: 'Proofread',
        text: parsed.corrected || input,
        changes: Array.isArray(parsed.changes) ? parsed.changes : []
      }
    } catch {
      return { kind: 'rewrite', title: 'Proofread', text: raw }
    }
  }

  if (action === 'tone') {
    const t = (tone || '').trim()
    if (!t) throw new Error('No tone specified.')
    const out = await call(
      `Rewrite the text in a ${t.toLowerCase()} tone, preserving meaning. ` +
        `Return ONLY the rewritten text.\n\nText:\n"""${input}"""`
    )
    return { kind: 'rewrite', title: `${t} tone`, text: out }
  }

  const instruction = REWRITE_INSTRUCTIONS[action]
  if (!instruction) throw new Error(`Unknown action: ${action}`)
  const out = await call(
    `${instruction}\n\nReturn ONLY the resulting text, no preamble.\n\nText:\n"""${input}"""`
  )
  return { kind: 'rewrite', title: REWRITE_TITLES[action], text: out }
}
