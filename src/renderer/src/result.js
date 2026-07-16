// One shared constructor for the result-panel state, so App and HotkeyPopover
// can't drift on which envelope fields survive (#16: App's reTone dropped the
// markdown flag, losing the rich-copy path for markdown results).

export const panelResult = (r) => ({ title: r.title, text: r.text, markdown: r.markdown })

// One shared invalidation rule for a provider switch, so hosts can't drift on
// which transients get dropped (#21: the overlay kept a deliverable result from
// the previous provider). `hint` is overlay-only.
export const clearPanel = (set) => {
  set.result(null)
  set.marks(null)
  set.error(null)
  set.copied(false)
  if (set.hint) set.hint(null)
}
