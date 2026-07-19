#!/usr/bin/env bash
# Ask a human a judgment-call question via Slack and BLOCK until they reply (or
# time out). Prints the chosen answer to stdout on success; exits non-zero when
# unanswered (unconfigured, post failed, or timed out) so the caller can fall
# back to its own stop-for-human path. The build agent calls this at a BLOCK (via
# Bash, mid-iteration) — it's a plain shell command, so it works in a headless
# `claude -p` run where the Slack MCP would not.
#
#   ans="$(scripts/ask-human.sh "Blocked on #58: <reason>." "try X" "block it")" \
#     && echo "human chose: $ans" || echo "no answer — falling back"
#
# Reply in the Slack THREAD with a number (1-based) or free text.
# Env: SLACK_BOT_TOKEN, SLACK_CHANNEL (required); ASK_POLL=20, ASK_TIMEOUT=900.
# Exit: 0 answered (answer on stdout) · 2 can't ask · 3 timed out.
set -uo pipefail
cd "$(dirname "$0")/.."

TOKEN="${SLACK_BOT_TOKEN:-}"
CHANNEL="${SLACK_CHANNEL:-}"
POLL="${ASK_POLL:-20}"
# Kept under loop.sh's ITER_TIMEOUT (30m) so a blocked iteration's wait can't trip
# the hung-iteration kill. Raise both together if you want a longer answer window.
TIMEOUT="${ASK_TIMEOUT:-900}"

question="${1:-}"
[ -n "$question" ] || { echo "ask-human: a question is required" >&2; exit 2; }
shift || true
options=("$@")

if [ -z "$TOKEN" ] || [ -z "$CHANNEL" ]; then
  echo "ask-human: SLACK_BOT_TOKEN/SLACK_CHANNEL unset — cannot ask a human" >&2
  exit 2
fi

api() { curl -sS -m 15 -H "Authorization: Bearer $TOKEN" "$@"; }
send() { # send CH TX [TS] -> chat.postMessage (TS makes it an in-thread reply); echoes the raw response
  CH="$1" TX="$2" TS="${3:-}" node -e 'const o={channel:process.env.CH,text:process.env.TX};if(process.env.TS)o.thread_ts=process.env.TS;process.stdout.write(JSON.stringify(o))' \
    | api -X POST https://slack.com/api/chat.postMessage \
        -H 'Content-type: application/json; charset=utf-8' --data @-
}

# Compose: question + numbered options + how-to-reply hint.
text="$question"
if [ "${#options[@]}" -gt 0 ]; then
  n=1
  for o in "${options[@]}"; do text="$text"$'\n'"  $n. $o"; n=$((n + 1)); done
  text="$text"$'\n'"_Reply in-thread with a number (1–$((n - 1))) or free text._"
else
  text="$text"$'\n'"_Reply in this thread._"
fi

resp="$(send "$CHANNEL" "$text")"
read -r ok ts ch < <(printf '%s' "$resp" | node -e '
  try { const d = JSON.parse(require("fs").readFileSync(0, "utf8"))
    process.stdout.write([d.ok ? 1 : 0, d.ts ?? "", d.channel ?? ""].join(" ")) }
  catch { process.stdout.write("0  ") }')
if [ "${ok:-0}" != 1 ] || [ -z "${ts:-}" ]; then
  echo "ask-human: chat.postMessage failed: $resp" >&2
  exit 2
fi

# Our own user id, so the parser never reads our messages as a human reply.
bot="$(api https://slack.com/api/auth.test \
  | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).user_id||"")}catch{}')"

waited=0
while [ "$waited" -lt "$TIMEOUT" ]; do
  sleep "$POLL"; waited=$((waited + POLL))
  answer="$(api "https://slack.com/api/conversations.replies?channel=$ch&ts=$ts&limit=50" \
    | node scripts/ask-parse.mjs "$bot" ${options[@]+"${options[@]}"})"
  if [ -n "$answer" ]; then
    printf '%s' "$answer"
    send "$ch" "✅ got it: $answer" "$ts" >/dev/null 2>&1 || true
    exit 0
  fi
done

send "$ch" "⏳ no reply in $((TIMEOUT / 60))m — proceeding without an answer." "$ts" >/dev/null 2>&1 || true
exit 3
