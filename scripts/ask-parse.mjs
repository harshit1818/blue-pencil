// Resolve a human's answer from a Slack conversations.replies payload.
// Pure + side-effect-light so it's unit-testable (test/ask-parse.test.mjs);
// ask-human.sh shells out to it once per poll.
//
//   stdin : the JSON body of conversations.replies
//   argv  : <botUserId> [option1 option2 ...]
//   stdout: the resolved answer, or "" if no human has replied yet
//
// Resolution: the LATEST in-thread message not authored by our bot. A bare
// integer picks the matching 1-based option; an exact (case-insensitive) option
// string matches too; anything else is passed through as a free-form answer.
import { readFileSync } from 'node:fs'

const [botId = '', ...options] = process.argv.slice(2)

let data
try {
  data = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // unreadable/partial (e.g. transient API error) — keep polling
}

const msgs = Array.isArray(data.messages) ? data.messages : []
// Skip the parent (our question, index 0); a real human reply has text, a user,
// and is not one of our own bot posts (auth.test id, or any bot_id/bot subtype).
const replies = msgs
  .slice(1)
  .filter((m) => m && m.text && m.user && m.user !== botId && !m.bot_id && m.subtype !== 'bot_message')

if (replies.length === 0) process.exit(0)

const text = String(replies[replies.length - 1].text).trim()
if (!text) process.exit(0)

if (options.length > 0 && /^\d+$/.test(text)) {
  const i = Number(text)
  if (i >= 1 && i <= options.length) {
    process.stdout.write(options[i - 1])
    process.exit(0)
  }
}

const match = options.find((o) => o.toLowerCase() === text.toLowerCase())
process.stdout.write(match ?? text) // free-form answers are allowed
