# Use the global hotkey

> Status: current · Updated: 2026-07-18

Press **⌘⇧'** to use Blue Pencil in any app without switching windows.

- **With macOS Accessibility granted:** select text → ⌘⇧' → it copies the
  selection for you → pick an action → the result is pasted back into the
  app.
- **Without it (default):** copy text (⌘C) → ⌘⇧' → pick an action → the
  result is copied to your clipboard → paste it back (⌘V). An **Enable** link
  in the popover turns on the auto path (grant Accessibility in System
  Settings, then restart).

Uses whatever provider/key you've set in the app. As a menu-bar (accessory)
app it floats over other apps **including fullscreen** ones. Digit keys
**1–9** run the nine quick actions directly (Proofread through Format, in
display order) once the popover is open; Enter runs the focused/primary
action; Escape dismisses.

See [`reference/hotkey-behavior.md`](../reference/hotkey-behavior.md) for the
full locked interaction contract, and
[`decisions/0002-menu-bar-accessory-overlay.md`](../decisions/0002-menu-bar-accessory-overlay.md)
for why the overlay can float over fullscreen Spaces at all.
