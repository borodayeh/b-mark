/**
 * Custom title bar.
 *
 * The window is frameless (`decorations: false`), so this strip *is* the title
 * bar: brand, document name, and the minimise / maximise / close buttons, all
 * on the same row as the toolbar below it. That removes the doubled-up chrome
 * you get when an app's own toolbar sits under the OS caption bar.
 *
 * Three things a hand-rolled title bar has to get right, and which are easy to
 * miss:
 *
 *   1. **Drag.** The empty area must move the window. Tauri exposes
 *      `data-tauri-drag-region`, but it swallows clicks, so every interactive
 *      child must sit outside it.
 *   2. **Double-click to maximise.** Windows users expect it on the caption.
 *   3. **Button order and hit targets.** Windows puts the controls top-right
 *      at 46×32 px each, and the close button turns red. Getting this wrong
 *      makes an app feel wrong in a way people notice but cannot name.
 *      In an RTL interface the controls stay on the right, because they belong
 *      to the OS convention rather than to the reading direction.
 */

import { icon, ICONS } from './icons';
import { brandMark } from './logo';
import { t } from '../i18n';
import type { Host } from '../platform';

export interface TitleBarState {
  /** File name, or null when nothing is open. */
  documentName: string | null;
  dirty: boolean;
}

export class TitleBar {
  private host: Host;
  private el: HTMLElement;
  private maximized = false;

  constructor(host: Host, mount: HTMLElement) {
    this.host = host;
    this.el = mount;
    this.el.classList.add('titlebar');
    // Windows keeps its caption controls on the right in every locale.
    this.el.setAttribute('dir', 'ltr');

    if (host.hasWindowControls) {
      host.onMaximizeChange((max) => {
        this.maximized = max;
        document.body.classList.toggle('is-maximized', max);
        this.syncMaximizeButton();
      });
    }
  }

  render(state: TitleBarState): void {
    const title = state.documentName
      ? `${state.dirty ? '\u2022 ' : ''}${state.documentName} — ${t('app.name')}`
      : t('app.name');

    this.el.innerHTML = `
      <div class="titlebar__brand" data-tauri-drag-region>
        ${brandMark(18)}
      </div>

      <div class="titlebar__title" data-tauri-drag-region title="${escapeAttr(title)}">
        ${escapeHtml(title)}
      </div>

      <div class="titlebar__drag" data-tauri-drag-region></div>

      ${
        this.host.hasWindowControls
          ? `<div class="wincontrols">
               <button class="wincontrol" id="win-min" title="${t('window.minimize')}"
                 aria-label="${t('window.minimize')}">${icon(ICONS.winMinimize)}</button>
               <button class="wincontrol" id="win-max" title="${t('window.maximize')}"
                 aria-label="${t('window.maximize')}">${icon(ICONS.winMaximize)}</button>
               <button class="wincontrol wincontrol--close" id="win-close" title="${t('window.close')}"
                 aria-label="${t('window.close')}">${icon(ICONS.winClose)}</button>
             </div>`
          : ''
      }
    `;

    if (!this.host.hasWindowControls) return;

    this.el.querySelector('#win-min')?.addEventListener('click', () => void this.host.minimize());
    this.el.querySelector('#win-max')?.addEventListener('click', () => void this.host.toggleMaximize());
    this.el.querySelector('#win-close')?.addEventListener('click', () => void this.host.close());

    // Double-clicking the caption maximises, as it does in every Windows app.
    for (const region of Array.from(this.el.querySelectorAll('[data-tauri-drag-region]'))) {
      region.addEventListener('dblclick', () => void this.host.toggleMaximize());
    }

    this.syncMaximizeButton();
  }

  private syncMaximizeButton(): void {
    const btn = this.el.querySelector('#win-max');
    if (!btn) return;
    btn.innerHTML = icon(this.maximized ? ICONS.winRestore : ICONS.winMaximize);
    const label = this.maximized ? t('window.restore') : t('window.maximize');
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
