import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = dirname(fileURLToPath(import.meta.url))
const tokens = resolve(root, 'src/shared/tokens.js')

// keytar and @anthropic-ai/sdk stay external (native module / node runtime).
// '@tokens' resolves to src/shared/tokens.js so main and renderer share one
// source of truth for colors/type/spacing.
export default defineConfig({
  main: {
    resolve: { alias: { '@tokens': tokens } },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { alias: { '@tokens': tokens } },
    server: { fs: { allow: [root] } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'src/renderer/index.html'),
          popover: resolve(root, 'src/renderer/popover.html')
        }
      }
    }
  }
})
