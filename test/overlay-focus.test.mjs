import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Blur-to-dismiss is the ONLY way the panel closes on a click elsewhere, and a
// window that never becomes key never blurs. Measured on macOS with a probe:
// showInactive() + win.focus() from a background app left isFocused() false a
// full second after the call (key status arrived ~1.5s later, if at all), so the
// panel could sit on screen forever. Adding app.focus({steal:true}) made it key
// in ~31ms and produced a blur 85ms after the user returned to the source app.
// The order matters: showInactive() first puts the window on the current Space,
// so activating afterwards can't pull the Space to another display (0002).
test('the overlay claims key focus by stealing app activation, after showing inactive', () => {
  const src = readFileSync(new URL('../src/main/overlay.js', import.meta.url), 'utf8')
  const show = src.indexOf('win.showInactive()')
  const steal = src.search(/app\.focus\(\{\s*steal:\s*true\s*\}\)/)
  assert.ok(show !== -1, 'the panel must still be shown inactive first (Space safety)')
  assert.ok(steal !== -1, 'without steal:true a background app never gets key focus, so blur never fires')
  assert.ok(steal > show, 'stealing activation before the window is on this Space can move Spaces')
})
