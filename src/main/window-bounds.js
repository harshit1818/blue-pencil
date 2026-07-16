// Pure validation for saved window bounds — no electron imports, so it loads
// under plain `node --test`. Guards against restoring onto a display that no
// longer exists (undocked monitor): the saved rect must overlap some display's
// work area enough to grab the title bar, else fall back to defaults.

const MIN_VISIBLE = 40

export function validBounds(saved, displays) {
  if (!saved) return null
  const { x, y, width, height } = saved
  if (![x, y, width, height].every(Number.isFinite)) return null
  const visible = displays.some(({ workArea: a }) => {
    const overlapW = Math.min(x + width, a.x + a.width) - Math.max(x, a.x)
    const overlapH = Math.min(y + height, a.y + a.height) - Math.max(y, a.y)
    return overlapW >= MIN_VISIBLE && overlapH >= MIN_VISIBLE
  })
  return visible ? saved : null
}
