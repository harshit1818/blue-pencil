import keytar from 'keytar'

// The API key lives only in the macOS Keychain — never in plaintext on disk,
// never in the renderer.
const SERVICE = 'BluePencil'
const ACCOUNT = 'anthropic-api-key'

export async function getApiKey() {
  return keytar.getPassword(SERVICE, ACCOUNT)
}

export async function setApiKey(key) {
  const trimmed = (key || '').trim()
  if (!trimmed) throw new Error('API key is empty.')
  await keytar.setPassword(SERVICE, ACCOUNT, trimmed)
  return true
}

export async function hasApiKey() {
  return Boolean(await getApiKey())
}

// First-run convenience: if the Keychain has no key but ANTHROPIC_API_KEY is set
// in the environment, move it into the Keychain once. The env var is never
// persisted to disk by us.
export async function seedFromEnv() {
  if (await hasApiKey()) return
  const fromEnv = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (fromEnv) await keytar.setPassword(SERVICE, ACCOUNT, fromEnv)
}
