/**
 * Right-click context menu.
 *
 * Built from the current selection and the element under the cursor, so it
 * only ever offers actions that will actually do something — an empty "Copy"
 * on no selection is worse than no Copy at all.
 */

import { t, uiDirection } from '../i18n';

export interface MenuContext {
  /** Element the user right-clicked. */
  target: Element | null;
  hasSelection: boolean;
  /** External URL when the click landed on a link. */
  linkHref: string | null;
  /** True when a document is open. */
  hasFile: boolean;
  /** Only the desktop host can show a folder in Explorer. */
  canRevealFolder: boolean;
  /**
   * True when the document is open for editing. The Persian fixer rewrites the
   * source, so it is offered only when that is what the user is doing —
   * offering it on a document someone is merely reading would be offering to
   * change a file they never asked to edit.
   */
  canFixPersian: boolean;
}

export interface MenuActions {
  copy: () => void;
  copyRich: () => void;
  copyMarkdown: () => void;
  fixPersian: () => void;
  selectAll: () => void;
  openLink: (href: string) => void;
  copyLink: (href: string) => void;
  openFolder: () => void;
  find: () => void;
  exportHtml: () => void;
  exportDocx: () => void;
  print: () => void;
  reload: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  settings: () => void;
  outline?: () => void;
}

interface Item {
  key: string;
  label: string;
  run: () => void;
  /** Rendered greyed and inert — a heading, or an entry that cannot act. */
  inert?: boolean;
}

export type MenuEntry = Item | 'separator';

/** An entry that does nothing — shown greyed rather than offered as live. */
function inert(key: string, label: string): Item {
  return { key, label, run: () => undefined, inert: true };
}

let menu: HTMLElement | null = null;
/** Detaches the window-level dismiss listeners belonging to the open menu. */
let detach: (() => void) | null = null;
/** Where focus came from, so closing the menu puts it back. */
let returnFocusTo: HTMLElement | null = null;

export function closeContextMenu(): void {
  // Only reclaim focus if it is still inside the menu: stealing focus back
  // from wherever the user went after an entry ran would be worse than leaving
  // it alone.
  if (menu && document.activeElement instanceof Node && menu.contains(document.activeElement)) {
    returnFocusTo?.focus();
  }
  menu?.remove();
  menu = null;
  returnFocusTo = null;
  detach?.();
  detach = null;
}

export function isContextMenuOpen(): boolean {
  return menu !== null;
}

function build(ctx: MenuContext, actions: MenuActions): Array<Item | 'separator'> {
  const items: Array<Item | 'separator'> = [];

  if (ctx.hasSelection) {
    items.push({ key: 'copy', label: t('menu.copy'), run: actions.copy });
  }
  if (ctx.hasFile) {
    items.push({ key: 'copyRich', label: t('menu.copyRich'), run: actions.copyRich });
    items.push({ key: 'copyMarkdown', label: t('menu.copyMarkdown'), run: actions.copyMarkdown });
  }
  if (ctx.linkHref) {
    const href = ctx.linkHref;
    items.push({ key: 'openLink', label: t('menu.openLink'), run: () => actions.openLink(href) });
    items.push({ key: 'copyLink', label: t('menu.copyLink'), run: () => actions.copyLink(href) });
  }
  if (items.length > 0) items.push('separator');

  items.push({ key: 'selectAll', label: t('menu.selectAll'), run: actions.selectAll });

  if (ctx.hasFile) {
    items.push('separator');
    items.push({ key: 'find', label: t('menu.find'), run: actions.find });
    items.push({ key: 'outline', label: t('menu.outline'), run: actions.outline ?? (() => undefined) });
    items.push('separator');
    // Only when the editor is open: see MenuContext.canFixPersian.
    if (ctx.canFixPersian) {
      items.push({ key: 'fixPersian', label: t('menu.fixPersian'), run: actions.fixPersian });
      items.push('separator');
    }
    items.push({ key: 'export', label: t('menu.export'), run: actions.exportHtml });
    items.push({ key: 'exportDocx', label: t('menu.exportDocx'), run: actions.exportDocx });
    items.push({ key: 'print', label: t('menu.print'), run: actions.print });
    items.push('separator');
    items.push({ key: 'reload', label: t('menu.reload'), run: actions.reload });
    // Offered only when it will actually work — a disabled entry that does
    // nothing is worse than no entry at all.
    if (ctx.canRevealFolder) {
      items.push({ key: 'openFolder', label: t('menu.openFolder'), run: actions.openFolder });
    }
  }

  items.push('separator');
  items.push({ key: 'zoomIn', label: t('menu.zoomIn'), run: actions.zoomIn });
  items.push({ key: 'zoomOut', label: t('menu.zoomOut'), run: actions.zoomOut });
  items.push({ key: 'zoomReset', label: t('menu.zoomReset'), run: actions.zoomReset });
  items.push('separator');
  items.push({ key: 'settings', label: t('menu.settings'), run: actions.settings });

  return items;
}

/**
 * Show a menu at the pointer. The shared half of every menu in the app:
 * positioning, the mousedown-not-click activation, dismissal and keyboard
 * navigation. `openContextMenu` and `openTabMenu` only build the entries.
 */
export function openMenu(event: MouseEvent, entries: MenuEntry[]): void {
  closeContextMenu();
  const items = entries;

  menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-orientation', 'vertical');
  menu.setAttribute('dir', uiDirection());
  menu.innerHTML = items
    .map((item, i) =>
      item === 'separator'
        ? '<div class="ctxmenu__sep" role="separator"></div>'
        : `<button class="ctxmenu__item${item.inert ? ' ctxmenu__item--inert' : ''}" role="menuitem"
            tabindex="-1" data-i="${i}"${item.inert ? ' aria-disabled="true"' : ''}>${item.label}</button>`,
    )
    .join('');

  // Position off-screen first so we can measure, then clamp into the window.
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const pad = 6;
  // A menu opened near the right or bottom edge must flip, not overflow —
  // the same "nothing escapes the frame" rule the content follows.
  const x = Math.min(event.clientX, window.innerWidth - rect.width - pad);
  const y = Math.min(event.clientY, window.innerHeight - rect.height - pad);
  menu.style.left = `${Math.max(pad, x)}px`;
  menu.style.top = `${Math.max(pad, y)}px`;
  menu.style.visibility = 'visible';

  /*
   * Run on mousedown, not click.
   *
   * The dismiss handler below is a capturing `mousedown` listener on window.
   * Pressing a menu item fired that first, which removed the menu from the
   * DOM — so the `click` that would have run the action was never dispatched
   * against anything, and every single entry silently did nothing. Acting on
   * the same event that dismisses, before the dismissal, is what makes the
   * menu work at all.
   */
  const activate = (e: Event): void => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-i]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const item = items[Number(btn.dataset.i)];
    closeContextMenu();
    if (item && item !== 'separator') item.run();
  };
  menu.addEventListener('mousedown', activate);
  // Keyboard and accessibility tooling dispatch `click` without a preceding
  // `mousedown`; `isContextMenuOpen()` keeps this from running twice.
  menu.addEventListener('click', (e) => {
    if (isContextMenuOpen()) activate(e);
  });

  // Keyboard navigation. A `role="menu"` that cannot be driven from the
  // keyboard is a lie told to screen readers, so arrows move, Enter/Space
  // activate (the buttons do that natively), and Tab cycles inside rather
  // than escaping to the page behind.
  const focusables = () =>
    Array.from(menu!.querySelectorAll<HTMLElement>('.ctxmenu__item'));
  const move = (to: number) => {
    const list = focusables();
    if (list.length === 0) return;
    list[((to % list.length) + list.length) % list.length]!.focus();
  };
  menu.addEventListener('keydown', (e) => {
    const list = focusables();
    const at = list.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(at + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(at - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(list.length - 1);
        break;
      case 'Tab':
        // Keep focus inside the menu instead of walking the document behind it.
        e.preventDefault();
        move(at + (e.shiftKey ? -1 : 1));
        break;
      case 'Escape':
        e.preventDefault();
        closeContextMenu();
        break;
    }
  });

  const dismiss = (e?: Event): void => {
    // A press inside the menu is a selection, not a dismissal. This listener
    // is capturing, so it runs *before* the menu's own handler; without this
    // guard it tore the menu down first and no entry ever fired.
    // `resize` and `blur` target the window, which is not a Node — passing
    // it to contains() throws, which would take the whole handler down.
    const node = e?.target;
    if (node instanceof Node && menu?.contains(node)) return;
    closeContextMenu();
  };
  detach = () => {
    window.removeEventListener('mousedown', dismiss, true);
    window.removeEventListener('resize', dismiss);
    window.removeEventListener('blur', dismiss);
  };
  window.addEventListener('mousedown', dismiss, true);
  window.addEventListener('resize', dismiss);
  window.addEventListener('blur', dismiss);

  // Open with the first entry focused, so the keyboard path starts somewhere.
  returnFocusTo = document.activeElement as HTMLElement | null;
  focusables()[0]?.focus();
}

export function openContextMenu(
  event: MouseEvent,
  ctx: MenuContext,
  actions: MenuActions,
): void {
  openMenu(event, build(ctx, actions));
}

// ------------------------------------------------------------------ tabs --

export interface TabMenuHandlers {
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  /** False when this is the only tab, so "close others" would be a no-op. */
  hasOthers: boolean;
}

/**
 * Right-click on a tab. `DocumentSet` has had `closeOthers`/`closeAll` since
 * they were written and the two strings have been in both catalogues since
 * 0.1.2 — the menu that was supposed to call them was never built.
 */
function buildTabItems(h: TabMenuHandlers): MenuEntry[] {
  const items: MenuEntry[] = [{ key: 'close', label: t('tabs.close'), run: h.onClose }];
  if (h.hasOthers) {
    items.push({ key: 'closeOthers', label: t('tabs.closeOthers'), run: h.onCloseOthers });
  }
  items.push({ key: 'closeAll', label: t('tabs.closeAll'), run: h.onCloseAll });
  return items;
}

export function openTabMenu(event: MouseEvent, handlers: TabMenuHandlers): void {
  openMenu(event, buildTabItems(handlers));
}

// -------------------------------------------------------------- spellings --

export interface SuggestionMenu {
  /** Heading naming the word being corrected. */
  title: string;
  /** Each entry replaces the word with its own text. */
  suggestions: Array<{ text: string; run: () => void }>;
}

/**
 * Right-click inside the editor on a misspelled word.
 *
 * `suggest()` has existed since spell checking shipped, but nothing ever called
 * it: the preview underlined misspellings and offered no way to act on them,
 * which is half a feature. This is the other half — and it lives in the editor
 * rather than the preview, because only there do the caret position and the
 * buffer share one coordinate system, so a replacement can be applied exactly.
 */
export function openSuggestionMenu(event: MouseEvent, menu: SuggestionMenu): void {
  const entries: MenuEntry[] = [inert('word', menu.title), 'separator'];
  for (const s of menu.suggestions) {
    entries.push({ key: `s:${s.text}`, label: s.text, run: s.run });
  }
  openMenu(event, entries);
}
