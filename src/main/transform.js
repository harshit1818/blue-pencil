import { ask, resolveActive } from './providers.js'
import { unwrapModelText } from './markdown.js'

// Prompt construction lives here, between the IPC handler and the provider
// registry. The renderer sends only a semantic action; the active provider and
// model are resolved here from the main-process settings — never prompt text.
// (This is what lets a second window — the future overlay — request a transform
// knowing nothing but the action.)

const REWRITE_INSTRUCTIONS = {
  improve: 'Revise to improve clarity, flow and word choice while preserving meaning and voice.',
  simplify: 'Rewrite so it is clear and easy to read; cut unnecessary words.',
  summarize: 'Summarize concisely in the same voice.',
  paraphrase:
    'Reword to express the same meaning with different phrasing and sentence structure; keep the meaning and key facts intact.',
  neutralize:
    'Rewrite to remove subjective, biased, emotional or promotional language; state it factually and even-handedly while preserving the information.',
  formalize:
    'Rewrite in a formal register; remove casual phrasing, contractions and slang while preserving meaning.',
  coherence:
    'Improve the logical flow and the connections between sentences so it reads coherently; preserve the meaning and keep the wording where you can.'
}

const REWRITE_TITLES = {
  improve: 'Improve',
  simplify: 'Simplify',
  summarize: 'Summarize',
  paraphrase: 'Paraphrase',
  neutralize: 'Neutralize',
  formalize: 'Formalize',
  coherence: 'Coherence'
}

// Pull the first {...} object out of a model reply, tolerating code fences or
// surrounding prose. Throws if there's no object to parse.
function parseJsonObject(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object found')
  return JSON.parse(raw.slice(start, end + 1))
}

// Identify-and-add-structure. Always returns Markdown (markdown:true), regardless of
// whether the input was already rich — Format's whole job is to add structure.
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

// When the grabbed input was rich text (Case 1), instruct the model to preserve its
// Markdown so an edit doesn't flatten the formatting. The result then carries the
// same markdown flag, so it renders in the preview and delivers as rich text.
const preserveClause = (markdown) =>
  markdown
    ? ' The text is in Markdown — preserve all of its formatting (bold, italics, lists, ' +
      'inline and fenced code, headings, blockquotes, links) and return Markdown.'
    : ''

// payload: { text, action: 'proofread'|'improve'|'simplify'|'summarize'|'format'|'tone', tone?, markdown? }
// returns: { kind: 'proofread'|'rewrite', title, text, changes?, markdown }
/**
 * @param {{ text?: string, action?: string, tone?: string, markdown?: boolean }} [payload]
 */
export async function transform({ text, action, tone, markdown = false } = {}) {
  const input = (text || '').trim()
  if (!input) throw new Error('Nothing to transform.')

  const { provider, model } = resolveActive()
  const call = (prompt) => ask({ provider, model, prompt })
  const preserve = preserveClause(markdown)

  if (action === 'proofread') {
    const raw = await call(
      'You are a copy editor. Make the smallest set of edits that fix spelling, grammar and ' +
        'punctuation errors. Do NOT rewrite, rephrase, reorder, or improve style — preserve the ' +
        'original wording, tone and structure verbatim except for the specific errors you correct.' +
        preserve +
        ' Respond ONLY with minified JSON shaped ' +
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
        changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        markdown
      }
    } catch {
      return { kind: 'rewrite', title: 'Proofread', text: unwrapModelText(raw, { allowBare: true }), markdown }
    }
  }

  if (action === 'format') {
    const out = await call(`${FORMAT_INSTRUCTION}\n\nText:\n"""${input}"""`)
    // allowBare:false — a Format result may legitimately be a single fenced block.
    return { kind: 'rewrite', title: 'Format', text: unwrapModelText(out), markdown: true }
  }

  if (action === 'tone') {
    const t = (tone || '').trim()
    if (!t) throw new Error('No tone specified.')
    const out = await call(
      `Rewrite the text in a ${t.toLowerCase()} tone, preserving meaning.` +
        preserve +
        ` Return ONLY the rewritten text.\n\nText:\n"""${input}"""`
    )
    return { kind: 'rewrite', title: `${t} tone`, text: unwrapModelText(out, { allowBare: true }), markdown }
  }

  const instruction = REWRITE_INSTRUCTIONS[action]
  if (!instruction) throw new Error(`Unknown action: ${action}`)
  const out = await call(
    `${instruction}${preserve}\n\nReturn ONLY the resulting text, no preamble.\n\nText:\n"""${input}"""`
  )
  return {
    kind: 'rewrite',
    title: REWRITE_TITLES[action],
    text: unwrapModelText(out, { allowBare: true }),
    markdown
  }
}
