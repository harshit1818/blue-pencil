# Running the Ralph loop in a sandbox

`loop.sh` runs `claude -p --dangerously-skip-permissions`: a non-deterministic process
with unrestricted shell and network access. The `verify`-time secret scan only guards
what gets *committed* — it does nothing about what an iteration can read or exfiltrate
while running. The consensus for unattended skip-permissions runs is unambiguous:
**sandbox it, with restricted egress.** This directory (`.devcontainer/`) is that
sandbox.

## What's in the box

- `Dockerfile` — Debian + Node 20 (matches the host), `git`, `gh`, the Claude Code
  CLI, and the native-build deps `keytar` needs on Linux (`libsecret-1-dev`,
  `build-essential`, `python3`). `iptables`/`ipset`/`dnsutils` are there for the
  firewall.
- `init-firewall.sh` — default-DROP egress with a small allowlist (Anthropic API,
  GitHub, npm registry). Everything else is refused. Needs `NET_ADMIN`.
- `devcontainer.json` — builds the image, adds the `NET_ADMIN`/`NET_RAW` caps, and runs
  the firewall + `npm install` on create.

## The Electron-build question (why `verify` still works in a Linux container)

`npm run verify` ends in `npm run build` = `electron-vite build`. That step only bundles
JS with Vite/esbuild — it is platform-independent and runs fine on Linux. The macOS
artifact (`npm run dist` = `electron-builder --mac`, which produces the `.dmg`) is the
*only* part that must stay on the host, and the loop never runs it. The tests are
deliberately electron-free (providers/transform load without electron/keytar — the
repo's lazy-import pattern), so `node --test` doesn't need a display or a real Electron
runtime. The one Linux-specific need is `keytar`'s native rebuild during
`postinstall`, which is why the image installs `libsecret-1-dev` + build tools.

**Decision:** run the full `verify` (typecheck + lint + secret-scan + test + build)
in-container; keep `dist` on the host. No container-safe subset needed.

## Run it

```bash
# In VS Code: "Dev Containers: Reopen in Container", then:
git checkout -b loop/work         # loop.sh refuses to run on main
ANTHROPIC_API_KEY=… ./loop.sh 10  # or rely on your logged-in claude credentials
```

## Verifying the egress allowlist (do this once)

Inside the container:

```bash
curl -sS --max-time 5 https://example.com     # must FAIL (blocked)
curl -sS --max-time 5 https://api.anthropic.com/  # must connect (allowlisted)
curl -sS --max-time 5 https://github.com/         # must connect (allowlisted)
```

If `example.com` succeeds, the firewall did not apply — check that the container has
`NET_ADMIN` and that `init-firewall.sh` ran (see `postCreateCommand` output).
