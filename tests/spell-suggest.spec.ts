/**
 * Spelling suggestions, end to end.
 *
 * `suggest()` has existed since spell checking shipped in 0.1.2 and was never
 * called by anything: misspellings were underlined in the preview with no way
 * to act on them. Right-clicking a word in the editor now offers the
 * dictionary's corrections, and picking one replaces it in the buffer.
 *
 * The dictionaries are mocked — the real ones are 3 MB of Hunspell data and
 * this file is about the wiring, not the lexicon. `tests/persian.spec.ts`
 * covers which words get checked and where their bounds are.
 */

import { describe, expect, it, vi, beforeAll } from 'vitest';

vi.mock('../src/persian/spellcheck', () => ({
  checkSpelling: async (word: string) =>
    word === 'quik' ? [] : [{ word, start: 0, end: word.length, language: 'en' as const }],
  suggest: async (word: string) => (word === 'quik' ? ['quick', 'quid'] : []),
  looksWorthChecking: () => true,
  releaseDictionaries: () => undefined,
}));

const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

describe('spelling suggestions in the editor', () => {
  beforeAll(async () => {
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

    await import('../src/main');
    await settle(300);

    document
      .getElementById('btn-empty-sample')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    // Spell checking is off by default (the Persian dictionary costs ~172 MB),
    // and the suggestion menu must never be the thing that turns it on.
    document.getElementById('btn-settings')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    document
      .querySelector<HTMLElement>('.switch[data-field="spellCheck"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    document
      .querySelector<HTMLElement>('.panel__close')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }));
    await settle();
  });

  it('offers corrections for a misspelled word and applies the chosen one', async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.editor__input');
    expect(textarea).toBeTruthy();

    textarea!.value = 'the quik brown fox';
    // Caret inside "quik" — the word the menu has to correct.
    textarea!.setSelectionRange(5, 5);

    textarea!.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true, cancelable: true }),
    );
    await settle(60);

    const items = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item')).map((b) =>
      b.textContent?.trim(),
    );
    expect(items).toEqual(['Suggestions for “quik”', 'quick', 'quid']);

    const chosen = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item')).find(
      (b) => b.textContent?.trim() === 'quick',
    )!;
    chosen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    chosen.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    if (chosen.isConnected) chosen.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(60);

    // The buffer is corrected, and the document is dirty because of it.
    expect(textarea!.value).toBe('the quick brown fox');
    expect(
      (document.querySelector('.titlebar__title')?.textContent ?? '').trim().startsWith('\u2022'),
    ).toBe(true);
  }, 15_000);

  it('leaves the platform menu alone for a correctly spelled word', async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.editor__input');
    expect(textarea).toBeTruthy();
    textarea!.value = 'the quick brown fox';
    textarea!.setSelectionRange(5, 5);

    const event = new MouseEvent('contextmenu', {
      clientX: 40,
      clientY: 40,
      bubbles: true,
      cancelable: true,
    });
    textarea!.dispatchEvent(event);
    await settle(60);

    // No menu of ours, and the event was not swallowed: the browser's own
    // cut/copy/paste menu still appears, exactly as before.
    expect(document.querySelector('.ctxmenu')).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  }, 15_000);
});
