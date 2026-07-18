# Product

> Status: current · Updated: 2026-07-18

## What

A desktop writing surface where you draft roughly and get on-demand
proofreading, rewriting, tone adjustment, and summarization, powered by an LLM
you supply the key for.

## Who

A single user (you). No accounts, no multi-tenant, no telemetry.

## The one job

Turn a rough paragraph into a clean one without leaving the app — either from
the in-app writing surface, or from any other app via the global hotkey.

## Current scope (reality, not the original plan)

The original design doc (superseded; see `docs/phase2/` for the build specs
that shipped it) scoped the system-wide overlay as an explicit **Phase 3
stretch, out of v1**. That's stale: **the hotkey overlay shipped in Phase 2.**
Press `⌘⇧'` in any app — including a fullscreen one — to grab a selection (or
whatever's on the clipboard), run an action, and get the result back without
switching windows. See [`how-to/use-the-hotkey.md`](../how-to/use-the-hotkey.md)
and [`reference/hotkey-behavior.md`](../reference/hotkey-behavior.md).

What's actually still out of scope:

- **Exact selection-rectangle anchoring** via the macOS Accessibility
  (`AXUIElement`) API — the overlay anchors to the cursor position instead.
- **Reading/writing the focused field directly** in an arbitrary app beyond
  copy/paste — the hotkey flow works via the clipboard (and, with
  Accessibility granted, an automated copy/paste), not by inspecting the
  target app's UI tree.
- Real-time as-you-type underlines, multi-document management, sync,
  multi-tenant/accounts.

## Roadmap (known, deliberately deferred — not scheduled)

- Inline-editable captured text in the hotkey popover (currently read-only).
- Exact selection-rectangle anchoring for the overlay (would need the AX API
  above).
- Per-invocation provider switching from the overlay (currently: set the
  active provider in the main window; the overlay uses it).
