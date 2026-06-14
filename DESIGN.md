# Blue Pencil — Design Finalization

A personal macOS writing assistant. A single writing surface with a floating
assistant that opens on click, anchored to the text box. Grammarly-style
correction and rewriting, powered by an LLM you supply the key for.

This document is the locked design. The build (Electron scaffold, IPC, packaging)
follows from it.

---

## 1. Product

- **What:** A desktop writing surface where you draft roughly and get on-demand
  proofreading, rewriting, tone adjustment, and summarization.
- **Who:** A single user (you). No accounts, no multi-tenant, no telemetry.
- **The one job:** Turn a rough paragraph into a clean one without leaving the app.
- **Explicitly NOT in v1:** floating over *other* apps (system-wide overlay),
  real-time as-you-type underlines, multi-document management, sync.

---

## 2. Design language

Carried over from the prototypes — the copyeditor's desk: ink on warm paper,
a single editor's blue-pencil accent, proof-red reserved strictly for corrections.

**Palette**

| Token       | Hex       | Use                                  |
|-------------|-----------|--------------------------------------|
| ink         | `#16181d` | text, dark UI                        |
| paper       | `#faf8f3` | app background, writing surface tint |
| panel       | `#ffffff` | cards, popover, textarea             |
| line        | `#e7e2d6` | borders, dividers                    |
| muted       | `#6f6a5f` | captions, secondary text             |
| pencil      | `#1f5fa8` | primary accent (the blue pencil)     |
| pencilSoft  | `#eaf1fa` | active fills, applied-change tint    |
| mark        | `#c2453d` | corrections only (struck text)       |
| markSoft    | `#fbecea` | correction background                |

**Type**

- Display / writing surface: serif stack — `"Iowan Old Style", Palatino, Georgia, serif`
- UI: grotesk — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
- Labels / counts: mono — `ui-monospace, "SF Mono", Menlo, monospace`

**Signature element:** the floating blue-pencil badge at the corner of the text
box. It is the one memorable thing; everything else stays quiet.

---

## 3. Interaction spec — the floating tab

- A circular badge sits at the bottom-right corner of the text box, always present.
- Clicking it opens a popover anchored to the box (does not push layout, floats above).
- The icon toggles: pencil when closed, × when open.
- Clicking outside the popover closes it.
- The popover holds: quick actions (Proofread, Improve, Simplify, Summarize),
  a Tone row (Professional, Confident, Friendly, Concise), and the result.
- Results show inside the popover with **Replace** (writes back into the box) and **Copy**.
- Proofread additionally lists each correction as `before → after (reason)`,
  struck text in mark-red, replacement in pencil-blue.

Reduced motion respected. Keyboard-focusable badge and actions.

---

## 4. Architecture

Electron. Chosen for fastest path given existing Electron experience; the in-app
floating tab is just a positioned element in the renderer.

```
renderer (React)         the prototype UI: surface + floating popover
   │  IPC: "transform"(text, action) → result
   ▼
main process             owns the API key; makes the model call
   │  reads key from macOS Keychain (never plaintext, never in renderer)
   ▼
provider adapter         single seam — ask(prompt) → string
                         default: Anthropic; swappable: OpenAI, Ollama (local)
```

**Key handling:** stored in macOS Keychain via `keytar` or Electron `safeStorage`.
`.env`, keys, and credentials in `.gitignore` from the first commit.

**Provider abstraction:** one `ask(prompt)` function behind an interface. Switching
provider changes only this file. Prompts are provider-agnostic.

---

## 5. Build phases

**Phase 1 — MVP (the target).**
Electron shell wrapping the prototype. Key in Keychain. Real model calls over IPC.
Acceptance: launch app → type rough text → click badge → Proofread returns
corrected text + change list → Replace updates the box. Signed, runs locally.

**Phase 2 — Product polish.**
Settings pane (provider / model / key). Custom-prompt library. Local-spellcheck-first
pass so typos cost no tokens. Diff view for proofread. Global hotkey to summon.
Menubar presence. Packaging: code signing + notarization (Apple Developer account
required), DMG, auto-update via electron-updater.

**Phase 3 — System-wide (stretch, separate decision).**
Transparent always-on-top overlay window + macOS Accessibility API (`AXUIElement`)
to read/write the focused field in any app + Accessibility permission. Weeks, not
days. Do not attempt before Phase 2 ships.

---

## 6. Repo conventions (for the agent)

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Never commit secrets. `.gitignore` covers `.env`, `*.pem`, key material.
- Phase 1 is the only milestone in scope until it runs and is signed.
