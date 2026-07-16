# Ralph plan loop — (re)write the plan, do NOT write code

You are one planning iteration with a FRESH context. Your only job is to produce
a good `IMPLEMENTATION_PLAN.md`. Do NOT implement anything. Do NOT commit code.

## Do this

1. Read `AGENTS.md` and skim the codebase (use subagents for breadth).
2. Read the current `IMPLEMENTATION_PLAN.md` if it exists.
3. Produce a prioritized, concrete plan. Each task must be:
   - Small enough to finish in ONE build iteration.
   - Independently verifiable via `npm run verify` (or a note if it isn't
     machine-verifiable — flag those as human-review, don't loop on them).
   - Written as an unchecked checkbox `- [ ]` with a one-line why.
4. Order by importance. Put the safest, highest-leverage work first.
5. Write the file. You MAY commit ONLY `IMPLEMENTATION_PLAN.md` (docs commit), or
   leave it uncommitted for review — do not touch source files.

## Guardrails

- Scope tasks HERE, at plan time. Never rely on the build loop to filter tasks at
  runtime — that is unreliable and wastes iterations.
- Prefer deletion and simplification tasks over new abstractions.
- Don't plan speculative features. Only what's needed now.
- If the codebase is already in good shape, say so and keep the plan short.
