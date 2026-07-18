> Status: Accepted · Updated: 2026-07-19

# 0006 — Provider registry: native Anthropic SDK + shared OpenAI-compatible client

## Context

Blue Pencil needs to support multiple LLM providers behind one `ask(prompt)`
seam, without one-off client wiring per provider as more get added.

## Decision

A single `REGISTRY` in `src/main/providers.js`, one entry per provider.
Anthropic goes over its own native SDK (`@anthropic-ai/sdk`); OpenAI, Groq,
and Gemini all speak the OpenAI chat-completions shape, so they share one
`openai` SDK client pointed at different `baseURL`s. Adding a provider that
speaks that shape is one registry entry (`kind: 'openai-compat'` + `baseURL`)
and nothing else in the app changes.

Verified against shipped code:
- `src/main/providers.js` — `REGISTRY` (`anthropic`, `openai`, `groq`,
  `gemini`), `askAnthropic()` vs `askOpenAICompat()`, `ask()` as the single
  dispatch seam. `groq`/`gemini` set `baseURL`; `openai` uses the SDK default.
- `docs/reference/providers.md` matches: default models, env-var seeding
  order, and the "one entry, nothing else changes" claim.

## Consequences

- Errors are normalized centrally (`src/main/provider-errors.js`) so the
  renderer never sees a raw SDK/network error or stack — a missing key
  surfaces as `code: 'NO_KEY'` with a message naming the provider.
- Default model ids are best-effort and move fast for the OpenAI-compatible
  providers — they're expected to go stale and are overridable from the
  in-app picker or by editing the registry entry directly.

## Alternatives considered

None recorded — the shared OpenAI-compatible client was the registry's
reason to exist from the start; see `reference/providers.md`.
