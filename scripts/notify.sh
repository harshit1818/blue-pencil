#!/usr/bin/env bash
# Fire-and-forget Slack ping for the moments that need eyes on a phone. Posts one
# message to $SLACK_CHANNEL via chat.postMessage. Best-effort by design: a broken
# notification must NEVER break the loop it reports on, so every failure path
# (unconfigured, network error, Slack error) exits 0 silently.
#
#   scripts/notify.sh "message"      # message from args
#   echo "message" | scripts/notify.sh
#
# Env: SLACK_BOT_TOKEN, SLACK_CHANNEL (a channel ID like C0123; invite the bot).
set -uo pipefail

TOKEN="${SLACK_BOT_TOKEN:-}"
CHANNEL="${SLACK_CHANNEL:-}"
[ -n "$TOKEN" ] && [ -n "$CHANNEL" ] || exit 0

msg="$*"
[ -n "$msg" ] || msg="$(cat)"
[ -n "$msg" ] || exit 0

CHANNEL="$CHANNEL" MSG="$msg" node -e 'process.stdout.write(JSON.stringify({channel:process.env.CHANNEL,text:process.env.MSG}))' \
  | curl -sS -m 10 -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-type: application/json; charset=utf-8' \
      --data @- >/dev/null 2>&1 || true
exit 0
