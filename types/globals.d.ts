// Ambient types for the preload bridge exposed at window.api (see src/preload/index.js).
// Keep in sync with that file — it is the only renderer↔main surface.

export interface Api {
  transform(payload: any): Promise<any>
  listProviders(): Promise<any>
  hasKey(provider: string): Promise<boolean>
  setKey(provider: string, key: string): Promise<any>
  getSettings(): Promise<any>
  setProvider(id: string): Promise<any>
  setModel(id: string, model: string): Promise<any>
  onSettingsChanged(cb: (settings: any) => void): () => void
  onPopoverShow(cb: (payload: any) => void): () => void
  popoverReady(): void
  popoverResize(w: number, h: number): void
  popoverDismiss(): void
  clipboardWrite(text: string): Promise<any>
  clipboardWriteResult(text: string, markdown: boolean): Promise<any>
  pasteBack(text: string, markdown: boolean): Promise<any>
  requestAccessibility(): Promise<any>
  openAccessibilitySettings(): void
  relaunchApp(): void
}

declare global {
  interface Window {
    api: Api
  }
}

// Blue Pencil tags the app instance so window-close can distinguish a real quit
// from a hide-to-tray (see src/main/index.js). Electron's App type lives in the
// Electron namespace, so augment there.
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}
