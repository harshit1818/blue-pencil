import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Minimal append-only logger. macOS: ~/Library/Logs/bluepencil/main.log.
// ponytail: bare appendFileSync + no rotation; add electron-log if this ever
// grows beyond a debug aid.
let file = null
function target() {
  if (file) return file
  const dir = app.getPath('logs')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* best-effort */
  }
  file = join(dir, 'main.log')
  return file
}

export function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(' ')}\n`
  try {
    appendFileSync(target(), line)
  } catch {
    /* never let logging break the app */
  }
}
