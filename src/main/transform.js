import { ask } from './providers.js'

// Prompt construction lives here, between the IPC handler and the provider
// registry. The renderer only sends a semantic action + the chosen provider/
// model — never prompt text.

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

// payload: { text, action: 'proofread'|'improve'|'simplify'|'summarize'|'tone',
//            tone?, provider, model? }
// returns: { kind: 'proofread'|'rewrite', title, text, changes? }
export async function transform({ text, action, tone, provider, model } = {}) {
  const input = (text || '').trim()
  if (!input) throw new Error('Nothing to transform.')

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
      const parsed = JSON.parse(raw.replace(/^```json?|```$/g, '').trim())
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
