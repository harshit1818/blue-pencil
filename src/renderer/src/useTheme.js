import { useState, useEffect } from 'react'
import { color } from '@tokens'

// Track macOS system appearance — Electron mirrors it to prefers-color-scheme.
// Shared by App, ActionPanel, and HotkeyPopover (was duplicated in each).
export function useThemeColors() {
  const pick = () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? color.dark : color.light
  const [c, setC] = useState(pick)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setC(pick())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return c
}
