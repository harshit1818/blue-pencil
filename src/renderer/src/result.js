// One shared constructor for the result-panel state, so App and HotkeyPopover
// can't drift on which envelope fields survive (#16: App's reTone dropped the
// markdown flag, losing the rich-copy path for markdown results).

export const panelResult = (r) => ({ title: r.title, text: r.text, markdown: r.markdown })
