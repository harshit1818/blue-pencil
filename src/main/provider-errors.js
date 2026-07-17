// Pure error shaping for providers.js — no electron/keytar imports, so it
// loads under plain `node --test`.

export function noKey(label) {
  const err = /** @type {Error & { code?: string }} */ (
    new Error(`No API key set for ${label}. Add the key to get started.`)
  )
  err.code = 'NO_KEY'
  return err
}

// Turn raw SDK errors into messages the renderer can show verbatim
// (design-notes: errors state what happened and how to fix it). Both the
// Anthropic and OpenAI SDKs expose .status on their error objects.
export function normalizeError(e, label, model) {
  const status = e?.status
  if (status === 401 || status === 403) {
    return new Error(`${label} rejected the key. Check it and try again.`)
  }
  if (status === 429) {
    return new Error(`${label} is rate-limiting — you’ve hit its quota or rate limit. Wait a moment, switch provider, or check your plan.`)
  }
  if (status === 404) {
    return new Error(`${label} didn’t recognise the model “${model}”. Check the model id.`)
  }
  if (typeof status === 'number' && status >= 500) {
    return new Error(`${label} had a server error. Try again shortly.`)
  }
  return e instanceof Error ? e : new Error(String(e))
}
