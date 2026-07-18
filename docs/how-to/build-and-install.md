# Build & install (local, unsigned)

> Status: current · Updated: 2026-07-18

```bash
npm run dist       # builds an unsigned Blue Pencil.dmg in dist/
```

Open the `.dmg`, drag **Blue Pencil** into Applications, and launch it. It's
an unsigned build — fine for your own machine:

- **First launch may be blocked.** Right-click the app → **Open** → **Open**
  (once). If macOS calls it "damaged," clear the quarantine flag:
  `xattr -dr com.apple.quarantine "/Applications/Blue Pencil.app"`.
- **Permissions re-prompt.** The packaged app is a different binary than the
  dev build, so macOS asks for **Accessibility** (and the **Automation**
  prompt on the first auto-grab) again. Grant Accessibility in System
  Settings, then relaunch.
- **Launch at login** is a checkbox in the menu-bar (✎) menu — tick it so the
  hotkey is always available.

Handing the app to *other* people additionally needs an Apple Developer ID
(code-signing + notarization) and `hardenedRuntime` flipped back on in
`package.json` → `build.mac`. For your own use the unsigned build above is
enough.
