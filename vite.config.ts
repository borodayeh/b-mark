import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

// The About box shows the real version, so read it from the single source of
// truth rather than hard-coding it in a second place that can drift.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string
}

// Tauri expects a fixed port and no clearScreen so its CLI output stays visible.
export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
    // Allow the Arena sandbox preview host as well as localhost.
    allowedHosts: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // A build stamp, so "which build am I actually running?" is answerable
    // from inside the app instead of by guessing at file dates.
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' '))
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Windows 10/11 WebView2 is evergreen Chromium.
    target: 'chrome105',
    /*
     * Never inline a dictionary.
     *
     * `en.aff` is only 2.6 KB, so Vite turned it into a `data:` URL — and the
     * Content-Security-Policy allows `connect-src 'self' ipc:` but not
     * `data:`, so fetching it was blocked and the English spell checker
     * silently never loaded. Emitting every dictionary as a real file keeps
     * them all on the same code path as the 2.5 MB Persian one.
     */
    assetsInlineLimit: (filePath: string) =>
      /\.(aff|dic)$/i.test(filePath) ? false : undefined,
    minify: 'esbuild',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    // One worker at a time. The DOCX exporter builds and zips whole packages
    // in memory and the Hunspell dictionaries are large, so several jsdom
    // workers in parallel exhaust the heap on a small machine.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000
  }
})
