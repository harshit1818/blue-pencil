// Pure field-qualification policy — no electron, loads under plain `node --test`.
// The F1 helper reports every non-secure focused element; Electron decides which
// deserve an icon. Policy lives here in ONE place (R1-R3,
// docs/phase3/anchored-icon.md §Field qualification), not scattered across callers.
//
// event shape (protocol-agnostic, from the helper):
//   { role, subrole, bundleId, width, height }

// Editable text roles. Real AX role strings; web-content editables surface as
// these too. F1's truth table (#53) may extend this — extend the array, not callers.
export const EDITABLE_ROLES = ['AXTextArea', 'AXTextField', 'AXComboBox']

// Secure roles/subroles: passwords. R2 — never qualifies, no setting can override.
export const SECURE_ROLES = ['AXSecureTextField', 'AXSecureTextArea']

// R3 — terminals + code editors denylisted by default (bundle ids). User entries
// are merged on top via settings; this is the built-in floor.
export const DEFAULT_DENYLIST = [
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'io.alacritty',
  'net.kovidgoyal.kitty',
  'dev.warp.Warp-Stable',
  'com.microsoft.VSCode',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.apple.dt.Xcode',
  'com.sublimetext.4',
  'com.jetbrains.intellij'
]

// Min-size heuristic: exclude single-line search/address bars, keep real
// composers. Starting point (docs §3): height ≥ ~2 text lines OR area above a
// threshold. ponytail: hardcoded thresholds, tune in M1 with real usage (#55 open q).
const MIN_HEIGHT = 40
const MIN_AREA = 15000

export function qualifies(event, settings = {}) {
  if (!event) return false
  const { role, subrole, bundleId, width, height } = event
  // R2: secure is a hard no, checked first — settings never reach this branch.
  if (SECURE_ROLES.includes(role) || SECURE_ROLES.includes(subrole)) return false
  if (!EDITABLE_ROLES.includes(role)) return false
  if (denylist(settings).includes(bundleId)) return false
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false
  return h >= MIN_HEIGHT || w * h >= MIN_AREA
}

// Effective denylist = built-in defaults + user entries, normalized. settings.js
// persists only the user array; this merges it with DEFAULT_DENYLIST.
export function denylist(settings = {}) {
  return normalizeDenylist([...DEFAULT_DENYLIST, ...(settings.denylist || [])])
}

// Trim, drop non-strings/blanks, dedup — the transform settings.js applies on
// write, so read-back is idempotent (the round-trip guarantee).
export function normalizeDenylist(list) {
  const seen = new Set()
  const out = []
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id !== 'string') continue
    const trimmed = id.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed)
    }
  }
  return out
}
