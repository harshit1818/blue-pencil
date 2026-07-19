// Pure overlay placement geometry — no electron imports, so it loads under plain
// `node --test` (same pattern as window-bounds.js). Given a requested anchor, a
// desired panel size, and the available displays, produce a clamped rect that
// stays fully inside the work area of the display the anchor falls on: flip up/left
// off the near edge, then clamp; cap the size to the work area so an oversized
// panel scrolls internally instead of overflowing. Groundwork for #7 (grows off
// bottom), #1 (edge clipping), #8 (stale size) — mirrors overlay.js positionAtCursor.

const GAP = 12

function displayForPoint(pt, displays) {
  const containing = displays.find(({ workArea: a }) =>
    pt.x >= a.x && pt.x < a.x + a.width && pt.y >= a.y && pt.y < a.y + a.height
  )
  if (containing) return containing
  let best = displays[0]
  let bestDist = Infinity
  for (const d of displays) {
    const a = d.workArea
    const cx = a.x + a.width / 2
    const cy = a.y + a.height / 2
    const dist = (cx - pt.x) ** 2 + (cy - pt.y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  return best
}

function validRect(r) {
  return Boolean(
    r &&
      Number.isFinite(r.x) &&
      Number.isFinite(r.y) &&
      Number.isFinite(r.width) &&
      Number.isFinite(r.height) &&
      r.width > 0 &&
      r.height > 0
  )
}

// Anchor the overlay to a focused field's rect (#58/#1): open just below the
// field's bottom edge, left-aligned, so it unfolds from the field rather than
// over the caret. If it wouldn't fit below, open above the field's top edge so
// it never clips off-screen or covers the text. null field (helper absent /
// crashed / unsupported app) returns null so callers fall back to the cursor
// path (R11). Reuses the clamp module's GAP + display resolution.
export function overlayRectForField(field, size, displays) {
  if (!validRect(field)) return null
  const { workArea: a } = displayForPoint({ x: field.x, y: field.y }, displays)
  const width = Math.min(size.width, a.width)
  const height = Math.min(size.height, a.height)
  let x = field.x
  let y = field.y + field.height + GAP
  if (y + height > a.y + a.height) y = field.y - height - GAP
  x = Math.max(a.x, Math.min(x, a.x + a.width - width))
  y = Math.max(a.y, Math.min(y, a.y + a.height - height))
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

export function clampOverlay(anchor, size, displays) {
  const { workArea: a } = displayForPoint(anchor, displays)
  const width = Math.min(size.width, a.width)
  const height = Math.min(size.height, a.height)
  let x = anchor.x + GAP
  let y = anchor.y + GAP
  // Flip across the anchor if we'd run off the right/bottom edge, then clamp so
  // the panel never extends past any work-area edge.
  if (x + width > a.x + a.width) x = anchor.x - width - GAP
  if (y + height > a.y + a.height) y = anchor.y - height - GAP
  x = Math.max(a.x, Math.min(x, a.x + a.width - width))
  y = Math.max(a.y, Math.min(y, a.y + a.height - height))
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}
