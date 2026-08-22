import { screen } from 'electron'
import { nearestSlot, placeAtSlot } from './overlay-slots.js'
import { getOverlaySlot, setOverlaySlot } from './settings.js'

// The one snap dance, shared by the overlay's 'moved' handler and the parked
// icon's dragEnd: find the nearest slot for where the window sits, persist it
// when it changed (both windows deliberately share the one slot), and pull the
// window onto the slot rect. Idempotent — a window already on its slot is a
// no-op, which is what stops programmatic placements from looping.
export function snapToNearestSlot(win) {
  const b = win.getBounds()
  const { workArea } = screen.getDisplayMatching(b)
  const slot = nearestSlot(b, workArea)
  if (slot !== getOverlaySlot()) setOverlaySlot(slot)
  const r = placeAtSlot(slot, b, workArea)
  if (r.x !== b.x || r.y !== b.y) {
    win.setPosition(r.x, r.y)
    return slot
  }
  return null // already in place
}
