// One shared constructor for the result-panel state, so App and HotkeyPopover
// can't drift on which envelope fields survive (#16: App's reTone dropped the
// markdown flag, losing the rich-copy path for markdown results).

export const panelResult = (r) => ({ title: r.title, text: r.text, markdown: r.markdown })

// One shared invalidation rule for a provider switch or overlay re-summon, so
// hosts can't drift on which transients get dropped (#21: the overlay kept a
// deliverable result from the previous provider). `hint` and `busy` are
// overlay-only (#43: the show-reset clears busy too). `gen` is the host's run
// generation ref — bumping it makes every in-flight stampRun read stale (#42).
export const clearPanel = (set) => {
  if (set.gen) set.gen.current += 1
  set.result(null)
  set.marks(null)
  set.error(null)
  set.copied(false)
  if (set.hint) set.hint(null)
  if (set.busy) set.busy(null)
}

// #42: sibling of #21 — a transform still in flight when the provider switches
// must not deliver a result produced by the previous provider. Stamp the run at
// start; once clearPanel bumps the generation, the stamp reads stale and the
// host drops the resolution.
export const stampRun = (gen) => {
  const stamp = gen.current
  return () => gen.current === stamp
}
