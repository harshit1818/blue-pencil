# PR writing (step 9 detail)

Write `.loop/pr-body.md` so the pull request reads as ordinary engineering work.

First line: a Conventional-Commits-style title for the CHANGE (e.g.
`feat(overlay): clamp geometry to the visible frame`) — describe the work, never the
loop. Then a blank line, then the body:

```
## What
<what changed, in prose>
## Why
<the problem it solves — include `Closes #N`>
## Testing
<the test that proves it, and that automated checks pass>
```

Do NOT mention the loop, Ralph, iterations, or automation anywhere in this file.
Write it ONLY for a card you completed (step 7 flipped to `[x]`); a blocked `[!]`
card writes no PR body. `.loop/` is gitignored — this file is transient, never committed.
