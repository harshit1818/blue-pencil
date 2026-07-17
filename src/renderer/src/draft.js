// Draft persistence for the main window — no DOM imports, so it loads under
// plain `node --test`. The demo typo sentence seeds the textarea on first run
// only; after that the user's draft survives quit/relaunch (#17).

export const DRAFT_KEY = 'bp.draft'

export const DEMO_TEXT =
  'i thinks the new featrue is realy usefull but the way its implemented have some issue that we should to discuss before shiping it.'

export function loadDraft(storage) {
  const saved = storage.getItem(DRAFT_KEY)
  return saved == null ? DEMO_TEXT : saved
}

export function saveDraft(storage, text) {
  try {
    storage.setItem(DRAFT_KEY, text)
  } catch {
    /* storage unavailable — draft just won't persist this session */
  }
}
