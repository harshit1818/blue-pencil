// Pure snap-slot placement — no electron imports, so it loads under plain
// `node --test` (same pattern as window-bounds.js). The overlay no longer
// follows the cursor: it appears at a named slot of the work area and stays
// there. Placement is a pure function of (slot, size, workArea), so a resize
// is just re-placement — each slot pins its named edges and growth moves away
// from them, which is what keeps the panel from shifting under the user.

const GAP = 12

export const SLOTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right']

export function normalizeSlot(slot) {
  return SLOTS.includes(slot) ? slot : 'bottom-right'
}

export function placeAtSlot(slot, size, a) {
  const { width, height } = capSize(size, a)
  const s = normalizeSlot(slot)
  const x = s.endsWith('right') ? a.x + a.width - GAP - width : a.x + GAP
  const y = s.startsWith('top')
    ? a.y + GAP
    : s.startsWith('bottom')
      ? a.y + a.height - GAP - height
      : Math.round(a.y + (a.height - height) / 2) // edge midpoint pins vertical centre
  return { x, y, width, height }
}

function capSize(size, a) {
  return {
    width: Math.round(Math.min(Math.max(1, size.width), a.width - 2 * GAP)),
    height: Math.round(Math.min(Math.max(1, size.height), a.height - 2 * GAP))
  }
}

// Field-anchored placement (F5): the panel unfolds from the ghost icon, not from
// a slot — right edges aligned, bottom a gap above the icon, flipping to the
// other side of the anchor when that leaves the work area, then clamped inside
// it. Same purity as placeAtSlot: (anchor, size, workArea) in, rect out, with
// the caller resolving which display's work area applies.
export function placeNearRect(anchor, size, a) {
  const { width, height } = capSize(size, a)
  let x = anchor.x + anchor.width - width
  if (x < a.x + GAP) x = anchor.x // flip: left-align with the icon instead
  let y = anchor.y - GAP - height
  if (y < a.y + GAP) y = anchor.y + anchor.height + GAP // flip: unfold downward
  return {
    x: Math.round(clamp(x, a.x + GAP, a.x + a.width - GAP - width)),
    y: Math.round(clamp(y, a.y + GAP, a.y + a.height - GAP - height)),
    width,
    height
  }
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi)
}

// Where the user dropped the window → the slot whose resolved position for the
// same size is closest (by top-left distance).
export function nearestSlot(bounds, a) {
  let best = SLOTS[0]
  let bestDist = Infinity
  for (const slot of SLOTS) {
    const r = placeAtSlot(slot, bounds, a)
    const dist = (r.x - bounds.x) ** 2 + (r.y - bounds.y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = slot
    }
  }
  return best
}
