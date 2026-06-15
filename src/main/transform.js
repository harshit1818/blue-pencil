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

// Identify-and-add-structure. Returns Markdown; markdown:true on the result drives
// both the rendered preview and target-aware delivery. (When the other actions
// become Markdown-aware in the next slice they set the same flag — no other change.)
const FORMAT_INSTRUCTION =
  'Add Markdown structure to the text below so it reads cleanly. Rules:\n' +
  '- Keep the original wording. You may adjust whitespace and add list markers, but do ' +
  'not add, remove, or reorder information.\n' +
  '- Keep related sentences together in one paragraph; separate blocks with a blank ' +
  'line. Do not put every sentence on its own line.\n' +
  '- Use a bullet or numbered list ONLY for a genuine enumeration of items.\n' +
  '- Use inline code for commands, identifiers, file paths and env vars; fenced code ' +
  'blocks for multi-line code.\n' +
  '- Use **bold** sparingly for real emphasis. Do NOT invent a heading unless the text ' +
  'clearly has a title.\n' +
  'Output GitHub-flavored Markdown only — no HTML, no commentary.'

// payload: { text, action: 'proofread'|'improve'|'simplify'|'summarize'|'format'|'tone', tone? }
// returns: { kind: 'proofread'|'rewrite', title, text, changes?, markdown? }
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

  if (action === 'format') {
    const out = await call(`${FORMAT_INSTRUCTION}\n\nText:\n"""${input}"""`)
    return { kind: 'rewrite', title: 'Format', text: out, markdown: true }
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
