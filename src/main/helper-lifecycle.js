// Pure helper respawn/heartbeat state machine — no electron imports, no real
// timers, so it loads under plain `node --test`. The caller (electron main)
// spawns/kills the F1 helper; this decides WHEN. Time is injected as `now` on
// every event, so tests drive it with plain numbers instead of fake timers.
//
// Policy (docs/phase3/anchored-icon.md §Lifecycle & failure):
// - crash → respawn with exponential backoff, `maxAttempts` (3) times, then give
//   up until next launch. Budget persists across respawns; only `start` resets it.
// - hung → heartbeat every few seconds; a stale heartbeat means kill + respawn,
//   counted against the same budget (a hang is a failure like a crash).
//
// Events return the actions the caller must perform: 'spawn', 'kill', 'giveup'.

const DEFAULTS = {
  maxAttempts: 3,
  backoffBaseMs: 500,
  backoffFactor: 2,
  heartbeatTimeoutMs: 6000
}

export function initialState() {
  return { status: 'idle', attempts: 0, lastBeatAt: 0, respawnAt: 0 }
}

export function createLifecycle(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts }
  let state = initialState()
  const step = (event) => {
    const result = reduce(cfg, state, event)
    state = result.state
    return result.actions
  }
  return {
    get state() {
      return state
    },
    // begin (or restart) the lifecycle — resets the attempt budget
    start: (now) => step({ type: 'start', now }),
    // a heartbeat line arrived from the running helper
    heartbeat: (now) => step({ type: 'heartbeat', now }),
    // the helper process exited (crash or otherwise)
    exit: (now) => step({ type: 'exit', now }),
    // periodic clock check: fire the pending respawn, or detect a stale heartbeat
    tick: (now) => step({ type: 'tick', now })
  }
}

export function reduce(cfg, state, { type, now }) {
  switch (type) {
    case 'start':
      return { state: { status: 'running', attempts: 0, lastBeatAt: now, respawnAt: 0 }, actions: ['spawn'] }
    case 'heartbeat':
      if (state.status !== 'running') return { state, actions: [] }
      return { state: { ...state, lastBeatAt: now }, actions: [] }
    case 'exit':
      // only a running helper can fail; ignore exits after a kill/give-up
      if (state.status !== 'running') return { state, actions: [] }
      return fail(cfg, state, now, [])
    case 'tick':
      if (state.status === 'running') {
        if (now - state.lastBeatAt > cfg.heartbeatTimeoutMs) return fail(cfg, state, now, ['kill'])
        return { state, actions: [] }
      }
      if (state.status === 'backoff' && now >= state.respawnAt) {
        return { state: { ...state, status: 'running', lastBeatAt: now }, actions: ['spawn'] }
      }
      return { state, actions: [] }
    default:
      return { state, actions: [] }
  }
}

function fail(cfg, state, now, pre) {
  const attempts = state.attempts + 1
  if (attempts > cfg.maxAttempts) {
    return { state: { ...state, status: 'gaveup' }, actions: [...pre, 'giveup'] }
  }
  const delay = cfg.backoffBaseMs * cfg.backoffFactor ** (attempts - 1)
  return { state: { status: 'backoff', attempts, lastBeatAt: state.lastBeatAt, respawnAt: now + delay }, actions: pre }
}
