/**
 * Auto-save under the desktop host.
 *
 * The browser host reports `canSave: false`, so this behaviour can only be
 * exercised against a Tauri-shaped host. Rather than mock half of `main.ts`,
 * this file fakes the four `@tauri-apps` modules `TauriHost` imports and lets
 * the real application boot on top of them — the same approach
 * `tests/platform.spec.ts` takes, one layer up.
 *
 * The bug this pins down: the auto-save timer used to evaluate `isDirty()` on
 * whichever tab was *active* when it fired, instead of the tab that was being
 * edited. Typing in one document and switching to another therefore left the
 * first one dirty indefinitely — the timer inspected a clean tab, found
 * nothing to save, and the edits sat in memory until the next keystroke there.
 */

import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: async () => ({
    isMaximized: async () => false,
    onResized: async () => undefined,
  }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => undefined }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: async () => '/docs/notes.md',
  save: async () => null,
}));

/** Every path `write_markdown_file` was called with, in order. */
const savedPaths = (): string[] =>
  invoke.mock.calls.filter(([cmd]) => cmd === 'write_markdown_file').map(([, args]) => args.path);

const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

describe('auto-save under the desktop host', () => {
  const internals = window as unknown as {
    __TAURI_INTERNALS__?: {
      metadata?: unknown;
      invoke?: unknown;
      transformCallback?: unknown;
    };
  };

  beforeAll(async () => {
    // A complete-enough stub. The `@tauri-apps` modules are mocked above, but
    // `main.ts` binds global key handlers that outlive this file (the specs
    // share one window in this pool), and its Escape handler calls
    // `isFullscreen()`. Without `metadata` the real package throws, which would
    // surface as an unhandled rejection in whichever spec runs next.
    internals.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      invoke: async () => undefined,
      transformCallback: () => 0,
    };

    document.documentElement.innerHTML = `
      <head></head>
      <body>
        <div id="app">
          <header class="titlebar" id="titlebar"></header>
          <div class="tabstrip" id="tabstrip" role="tablist" hidden></div>
          <nav class="toolbar" id="toolbar"></nav>
          <main class="body" id="body"></main>
          <footer class="statusbar" id="statusbar"></footer>
        </div>
      </body>`;

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as never;

    invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'load_settings':
          return null;
        case 'read_markdown_file':
          return {
            path: String(args?.path ?? ''),
            name: 'notes.md',
            dir: '/docs',
            content: '# notes\n',
            bytes: 8,
            modified_ms: 1,
          };
        case 'write_markdown_file':
          return 1;
        default:
          return undefined;
      }
    });

    await import('../src/main');
    await settle(300);

    // The bundled sample document.
    document
      .getElementById('btn-empty-sample')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    // Turn auto-save on through the real settings panel.
    document.getElementById('btn-settings')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    document
      .querySelector<HTMLElement>('.switch[data-field="autoSave"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    document.querySelector<HTMLElement>('.panel__close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
  });

  afterAll(() => {
    // The Tauri marker is a global, and the specs share one jsdom window in
    // this pool. Leaving it set would make every later file believe it is
    // running natively — and then fail on a Tauri API nobody mocked.
    delete internals.__TAURI_INTERNALS__;
  });

  it('writes the document that was edited, not whichever tab is active', async () => {
    expect(savedPaths()).toEqual([]);

    // Type in the sample document.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }));
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>('.editor__input');
    expect(textarea).toBeTruthy();
    textarea!.value += 'x';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    // Switch away to a second document before the timer fires.
    document.getElementById('btn-open')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(200);

    // The debounce is 2.5 s; give it room.
    await settle(3200);

    // The edited document was written even though it is no longer the active
    // tab — the timer is bound to the tab that was typed in.
    expect(savedPaths()).toContain('tests/fixtures/stress.md');
  }, 15_000);
});
