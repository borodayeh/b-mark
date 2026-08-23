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
