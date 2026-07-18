# Providers

> Status: current · Updated: 2026-07-18

Source of truth: `src/main/providers.js` (registry + `ask`) and
`src/main/keychain.js` (key storage).

## Registry

One seam, `ask({ provider, model, prompt }) → string`, backed by a small
registry in `src/main/providers.js`:

| Provider | Kind | Default model | Notes |
|---|---|---|---|
| `anthropic` | native SDK (`@anthropic-ai/sdk`) | `claude-opus-4-8` | |
| `openai` | OpenAI-compatible (`openai` SDK) | `gpt-4.1` | Default base URL (`api.openai.com`). |
| `groq` | OpenAI-compatible | `llama-3.3-70b-versatile` | `baseURL: https://api.groq.com/openai/v1`. |
| `gemini` | OpenAI-compatible | `gemini-2.0-flash` | `baseURL: https://generativelanguage.googleapis.com/v1beta/openai/`. |

Default model ids are best-effort and move fast for OpenAI/Groq/Gemini —
confirm the current id before relying on it; they're overridable from the
in-app picker or by editing the registry entry directly.

To add a provider: one entry in `REGISTRY`. If it speaks the OpenAI
chat-completions shape, set `kind: 'openai-compat'` and a `baseURL`; nothing
else in the app changes.

## Key storage

Keys live only in the macOS Keychain (via `keytar`), one account per
provider, all under the `BluePencil` service — never plaintext on disk, never
sent to or readable by the renderer. `key:set` (IPC) writes a trimmed,
non-empty key; `key:has` / `key:get` (internal) check/read it.

**First-run env seeding** (`seedFromEnv`, runs once at `app.whenReady`): if a
provider has no Keychain entry yet, its key is seeded from an environment
variable, then never read from the environment again:

| Provider | Env var(s) checked, in order |
|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `gemini` | `GEMINI_API_KEY`, then `GOOGLE_API_KEY` |

See `.env.example` for the expected variable names.

## Errors

`ask()` normalizes SDK/network errors into a `{ code, message }` shape
(`src/main/provider-errors.js`) — a missing key surfaces as `code: 'NO_KEY'`
with a message naming the provider; other failures get a normalized
user-facing message. The renderer never sees a raw stack.
