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
}

let menu: HTMLElement | null = null;
/** Detaches the window-level dismiss listeners belonging to the open menu. */
let detach: (() => void) | null = null;

export function closeContextMenu(): void {
  menu?.remove();
  menu = null;
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
    items.push({ key: 'fixPersian', label: t('menu.fixPersian'), run: actions.fixPersian });
    items.push('separator');
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

export function openContextMenu(
  event: MouseEvent,
  ctx: MenuContext,
  actions: MenuActions,
): void {
  closeContextMenu();
  const items = build(ctx, actions);

  menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('dir', uiDirection());
  menu.innerHTML = items
    .map((item, i) =>
      item === 'separator'
        ? '<div class="ctxmenu__sep" role="separator"></div>'
        : `<button class="ctxmenu__item" role="menuitem" data-i="${i}">${item.label}</button>`,
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
}
