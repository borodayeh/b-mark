/**
 * Right-click menu.
 *
 * The menu shipped in 0.1.0 and 0.1.1 looked correct and did nothing: the
 * window-level dismiss listener was capturing `mousedown`, so it removed the
 * menu from the DOM before the `click` that carried the action could be
 * dispatched. Every entry was dead. These tests drive the real event
 * sequence a browser produces — mousedown, mouseup, click — rather than
 * calling the handler directly, because calling the handler directly is
 * exactly what hid the bug.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  openContextMenu,
  closeContextMenu,
  isContextMenuOpen,
  openTabMenu,
  openSuggestionMenu,
  type MenuActions,
  type MenuContext,
} from '../src/components/context-menu';

function actions(): MenuActions & { calls: string[] } {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length ? `${name}:${String(args[0])}` : name);
    };
  return {
    calls,
    copy: rec('copy'),
    copyRich: rec('copyRich'),
    copyMarkdown: rec('copyMarkdown'),
    fixPersian: rec('fixPersian'),
    selectAll: rec('selectAll'),
    openLink: rec('openLink'),
    copyLink: rec('copyLink'),
    openFolder: rec('openFolder'),
    find: rec('find'),
    exportHtml: rec('exportHtml'),
    exportDocx: rec('exportDocx'),
    print: rec('print'),
    reload: rec('reload'),
    zoomIn: rec('zoomIn'),
    zoomOut: rec('zoomOut'),
    zoomReset: rec('zoomReset'),
    settings: rec('settings'),
    outline: rec('outline'),
  };
}

const ctx = (over: Partial<MenuContext> = {}): MenuContext => ({
  target: document.body,
  hasSelection: false,
  linkHref: null,
  hasFile: true,
  canRevealFolder: true,
  canFixPersian: true,
  ...over,
});

function rightClick(): MouseEvent {
  return new MouseEvent('contextmenu', { clientX: 20, clientY: 20, bubbles: true });
}

/**
 * The sequence a real browser dispatches when a button is pressed.
 *
 * The `isConnected` check is the whole point. A browser does not dispatch
 * `click` at the original target if that target left the document between
 * mousedown and mouseup — which is exactly what the old dismiss handler did.
 * jsdom happily dispatches on a detached node, so without this the test
 * passes against the broken implementation. It was verified to fail against
 * it with the check in place.
 */
function press(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  if (el.isConnected) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function itemByLabel(label: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no menu item labelled "${label}"`);
  return found;
}

beforeEach(() => {
  document.body.innerHTML = '';
  closeContextMenu();
});
afterEach(() => closeContextMenu());

describe('context menu — entries actually run', () => {
  it('runs the action for every single entry', () => {
    const a = actions();
    openContextMenu(rightClick(), ctx({ hasSelection: true, linkHref: 'https://example.com' }), a);

    const labels = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item')).map(
      (b) => b.textContent!.trim(),
    );
    expect(labels.length).toBeGreaterThan(10);

    // Press each entry in turn, reopening the menu each time.
    for (const label of labels) {
      if (!isContextMenuOpen()) {
        openContextMenu(
          rightClick(),
          ctx({ hasSelection: true, linkHref: 'https://example.com' }),
          a,
        );
      }
      press(itemByLabel(label));
    }

    // Every label produced exactly one call — none silently did nothing.
    expect(a.calls).toHaveLength(labels.length);
    expect(new Set(a.calls).size).toBe(labels.length);
  });

  it('closes itself once an entry has run', () => {
    const a = actions();
    openContextMenu(rightClick(), ctx(), a);
    expect(isContextMenuOpen()).toBe(true);
    press(itemByLabel('Zoom in'));
    expect(isContextMenuOpen()).toBe(false);
    expect(document.querySelector('.ctxmenu')).toBeNull();
  });

  it('does not fire twice when mousedown and click both arrive', () => {
    const a = actions();
    openContextMenu(rightClick(), ctx(), a);
    press(itemByLabel('Zoom in'));
    expect(a.calls).toEqual(['zoomIn']);
  });

  it('still works for a click with no preceding mousedown (keyboard, a11y)', () => {
    const a = actions();
    openContextMenu(rightClick(), ctx(), a);
    itemByLabel('Settings').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.calls).toEqual(['settings']);
  });

  it('passes the link href through to the action', () => {
    const a = actions();
    openContextMenu(rightClick(), ctx({ linkHref: 'https://example.com/x' }), a);
    press(itemByLabel('Open link'));
    expect(a.calls).toEqual(['openLink:https://example.com/x']);
  });
});

describe('context menu — dismissal', () => {
  it('closes on a press outside itself', () => {
    openContextMenu(rightClick(), ctx(), actions());
    expect(isContextMenuOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isContextMenuOpen()).toBe(false);
  });

  it('closes on resize and on losing focus', () => {
    for (const type of ['resize', 'blur']) {
      openContextMenu(rightClick(), ctx(), actions());
      window.dispatchEvent(new Event(type));
      expect(isContextMenuOpen()).toBe(false);
    }
  });

  it('leaves no window listeners behind after an entry runs', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    openContextMenu(rightClick(), ctx(), actions());
    const added = add.mock.calls.filter(([t]) => ['mousedown', 'resize', 'blur'].includes(t));
    press(itemByLabel('Zoom in'));
    const removed = remove.mock.calls.filter(([t]) => ['mousedown', 'resize', 'blur'].includes(t));
    expect(removed).toHaveLength(added.length);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('context menu — what it offers', () => {
  it('offers no Copy without a selection', () => {
    openContextMenu(rightClick(), ctx({ hasSelection: false }), actions());
    const labels = Array.from(document.querySelectorAll('.ctxmenu__item')).map((b) =>
      b.textContent!.trim(),
    );
    expect(labels).not.toContain('Copy');
  });

  it('hides document actions when nothing is open', () => {
    openContextMenu(rightClick(), ctx({ hasFile: false, canRevealFolder: false }), actions());
    const labels = Array.from(document.querySelectorAll('.ctxmenu__item')).map((b) =>
      b.textContent!.trim(),
    );
    expect(labels).not.toContain('Print…');
    expect(labels).not.toContain('Open containing folder');
    expect(labels).toContain('Settings');
  });
});

/**
 * The Persian fixer rewrites the source, so it may only be offered while the
 * document is open for editing. 0.1.2 offered it (and ran it) on a document
 * the user was merely reading, which marked a file dirty — and with auto-save
 * on, wrote it — from a reading mistake.
 */
describe('context menu — what it offers', () => {
  it('offers the Persian fixer only while editing', () => {
    openContextMenu(rightClick(), ctx({ canFixPersian: true }), actions());
    const editing = Array.from(document.querySelectorAll('.ctxmenu__item'));
    expect(editing.map((b) => b.textContent?.trim())).toContain('Fix Persian text');

    openContextMenu(rightClick(), ctx({ canFixPersian: false }), actions());
    const reading = Array.from(document.querySelectorAll('.ctxmenu__item')).map((b) =>
      b.textContent?.trim(),
    );
    expect(reading).not.toContain('Fix Persian text');
    // Everything else a reader can legitimately do is still there.
    expect(reading).toContain('Find in document…');
    expect(reading).toContain('Save as HTML…');
  });
});

/**
 * The tab menu.
 *
 * `DocumentSet.closeOthers`/`closeAll` and the two strings for this menu have
 * existed since 0.1.2 with nothing calling them — two features and two
 * translations sitting unused. These tests drive the menu that now calls them.
 */
describe('tab menu', () => {
  const labels = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item')).map((b) =>
      b.textContent?.trim(),
    );

  it('offers close, close others and close all', () => {
    openTabMenu(rightClick(), {
      onClose: () => undefined,
      onCloseOthers: () => undefined,
      onCloseAll: () => undefined,
      hasOthers: true,
    });
    expect(labels()).toEqual(['Close tab — Ctrl+W', 'Close other tabs', 'Close all tabs']);
  });

  it('omits "close others" for a lone tab, where it would do nothing', () => {
    openTabMenu(rightClick(), {
      onClose: () => undefined,
      onCloseOthers: () => undefined,
      onCloseAll: () => undefined,
      hasOthers: false,
    });
    expect(labels()).toEqual(['Close tab — Ctrl+W', 'Close all tabs']);
  });

  it('runs the handler of the entry pressed', () => {
    const calls: string[] = [];
    const handlers = {
      onClose: () => calls.push('close'),
      onCloseOthers: () => calls.push('others'),
      onCloseAll: () => calls.push('all'),
      hasOthers: true,
    };
    for (const label of ['Close other tabs', 'Close all tabs', 'Close tab — Ctrl+W']) {
      openTabMenu(rightClick(), handlers);
      press(itemByLabel(label));
    }
    expect(calls).toEqual(['others', 'all', 'close']);
  });
});

/**
 * A `role="menu"` that cannot be driven from the keyboard is a lie told to
 * screen readers. The menu used to have no keyboard path at all.
 */
describe('context menu — keyboard', () => {
  it('moves focus with the arrows, Home and End', () => {
    openContextMenu(rightClick(), ctx(), actions());
    const items = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item'));

    // Opens with the first entry focused.
    expect(document.activeElement).toBe(items[0]);

    const menu = document.querySelector<HTMLElement>('.ctxmenu')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);

    // Wraps backwards from the first entry.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('keeps Tab inside the menu instead of walking the document behind it', () => {
    openContextMenu(rightClick(), ctx(), actions());
    const items = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item'));
    const menu = document.querySelector<HTMLElement>('.ctxmenu')!;
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    menu.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[1]);
  });

  it('closes on Escape', () => {
    openContextMenu(rightClick(), ctx(), actions());
    const menu = document.querySelector<HTMLElement>('.ctxmenu')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isContextMenuOpen()).toBe(false);
  });

  it('activates the focused entry and gives focus back afterwards', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const a = actions();
    openContextMenu(rightClick(), ctx(), a);
    const menu = document.querySelector<HTMLElement>('.ctxmenu')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // The focused entry is a live one: clicking it (what Enter/Space do
    // natively) runs its action.
    (document.activeElement as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(a.calls).toHaveLength(1);
    expect(document.activeElement).toBe(trigger);
  });
});

/**
 * Spelling suggestions.
 *
 * `suggest()` has existed since spell checking shipped, but nothing ever called
 * it: misspellings were underlined with no way to act on them. This is the
 * missing half, and it has to live in the editor — the only place where the
 * caret and the buffer share one coordinate system.
 */
describe('suggestion menu', () => {
  it('lists the corrections under an inert heading', () => {
    const calls: string[] = [];
    openSuggestionMenu(rightClick(), {
      title: 'Suggestions for “quik”',
      suggestions: [
        { text: 'quick', run: () => calls.push('quick') },
        { text: 'quid', run: () => calls.push('quid') },
      ],
    });

    const items = Array.from(document.querySelectorAll<HTMLElement>('.ctxmenu__item'));
    expect(items.map((b) => b.textContent?.trim())).toEqual([
      'Suggestions for “quik”',
      'quick',
      'quid',
    ]);
    // The heading is a label, not an entry.
    expect(items[0]!.getAttribute('aria-disabled')).toBe('true');
    expect(items[0]!.classList.contains('ctxmenu__item--inert')).toBe(true);

    press(itemByLabel('quick'));
    expect(calls).toEqual(['quick']);
  });
});
