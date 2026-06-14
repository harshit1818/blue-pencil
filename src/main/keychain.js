import keytar from 'keytar'

// API keys live only in the macOS Keychain — never plaintext on disk, never in
// the renderer. One account per provider, all under the one app service.
const SERVICE = 'BluePencil'
const account = (provider) => `${provider}-api-key`

export async function getApiKey(provider) {
  return keytar.getPassword(SERVICE, account(provider))
}

export async function setApiKey(provider, key) {
  const trimmed = (key || '').trim()
  if (!trimmed) throw new Error('API key is empty.')
  await keytar.setPassword(SERVICE, account(provider), trimmed)
  return true
}

export async function hasApiKey(provider) {
  return Boolean(await getApiKey(provider))
}

// First-run convenience: seed each provider's Keychain entry from its env var
// if present and not already stored. The env vars are never persisted by us.
const ENV_VARS = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
}

export async function seedFromEnv() {
  for (const [provider, vars] of Object.entries(ENV_VARS)) {
    if (await hasApiKey(provider)) continue
    for (const v of vars) {
      const val = (process.env[v] || '').trim()
      if (val) {
        await keytar.setPassword(SERVICE, account(provider), val)
        break
      }
    }
  }
}
