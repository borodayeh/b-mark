/**
 * Application boot smoke test.
 *
 * `main.ts` wires the whole shell together and is imported nowhere else, so a
 * boot that throws — a missing element id, a handler bound to the wrong node,
 * an async step that rejects — would otherwise be caught only by hand. This
 * loads the module against a faithful copy of index.html and asserts the
 * empty state actually renders.
 */

import { describe, expect, it, vi, beforeAll } from 'vitest';

describe('application boot', () => {
  it('boots to the empty state without throwing', async () => {
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

    // jsdom does not implement matchMedia; the theme resolver needs it.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as never;

    await import('../src/main');
    // boot() is async; let its microtasks and the initial render settle.
    await new Promise((r) => setTimeout(r, 300));

    expect(document.getElementById('btn-empty-open')).toBeTruthy();
    expect(document.getElementById('btn-empty-sample')).toBeTruthy();
    // The toolbar is built even with no document open.
    expect(document.getElementById('btn-open')).toBeTruthy();
  });
});

/**
 * The tab strip is rebuilt on every chrome refresh (per keystroke in the
 * editor), but its click handlers are bound exactly once, at boot. No matter
 * how many rebuilds happened, one click on a close button must run closeTab
 * exactly once — this guards against a future change reintroducing a
 * per-render addEventListener with fresh closures, which would fire the
 * handler once per render.
 */
describe('tab strip handlers', () => {
  const settle = () => new Promise((r) => setTimeout(r, 60));

  beforeAll(async () => {
    // Open the bundled sample document.
    document.getElementById('btn-empty-sample')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    // Open a second document through the browser host's file picker: arm the
    // hidden input it creates, then answer its change event.
    document.getElementById('btn-open')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    const fake = {
      name: 'notes.md',
      size: 10,
      lastModified: 1,
      text: async () => '# notes\n',
    } as unknown as File;
    Object.defineProperty(input, 'files', { value: [fake], configurable: true });
    input!.dispatchEvent(new Event('change'));
    await settle();
  });

  it('still fires close exactly once after many chrome re-renders', async () => {
    const tabstrip = document.getElementById('tabstrip')!;
    expect(tabstrip.hidden).toBe(false);

    // Open the editor and type: every keystroke re-renders the tab strip.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }));
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>('.editor__input');
    expect(textarea).toBeTruthy();
    for (const ch of 'abc') {
      textarea!.value += ch;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await settle();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const closeBtn = tabstrip.querySelector<HTMLElement>('.tab--active [data-close]');
    expect(closeBtn).toBeTruthy();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    // One click, one confirmation — no matter how many re-renders happened.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
