/**
 * Folder browser.
 *
 * Turns B mark from a viewer that opens one file into something you can point
 * at a docs directory and work in. Deliberately narrow: it lists directories
 * and Markdown files and nothing else — a folder of a thousand photographs is
 * noise in a Markdown tree, and hiding them is more useful than greying them
 * out.
 *
 * Navigation is one level at a time rather than a lazily-expanding tree.
 * A tree looks better in a screenshot; a breadcrumb plus a flat list is faster
 * to scan, needs no expand/collapse state to keep in sync with the disk, and
 * never walks a directory the user did not ask for — which also keeps this
 * well clear of looking like filesystem-crawling behaviour.
 */

import { icon, ICONS } from './icons';
import { detectDirection } from '../direction/unicode';
import { t } from '../i18n';
import type { FolderEntry, Host } from '../platform';

export class FolderPanel {
  private root: HTMLElement;
  private host: Host;
  private onOpenFile: (path: string) => void;
  private current: string | null = null;
  private activePath: string | null = null;

  constructor(root: HTMLElement, host: Host, onOpenFile: (path: string) => void) {
    this.root = root;
    this.host = host;
    this.onOpenFile = onOpenFile;
    this.root.className = 'folders';
    this.root.setAttribute('role', 'navigation');
    this.root.setAttribute('aria-label', t('folder.title'));
  }

  get path(): string | null {
    return this.current;
  }

  /** Show a directory. Errors are reported in place, not as a toast storm. */
  async show(path: string): Promise<void> {
    this.current = path;
    this.renderLoading();
    try {
      const entries = await this.host.listFolder(path);
      this.render(entries);
    } catch {
      this.renderError();
    }
  }

  /** Highlight the open document, if it lives in the listed folder. */
  setActive(path: string | null): void {
    this.activePath = path;
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('.folders__item'))) {
      el.classList.toggle('folders__item--active', el.dataset.path === path);
    }
  }

  private renderLoading(): void {
    this.root.innerHTML = `<div class="folders__head">${escapeHtml(t('folder.title'))}</div>
      <p class="folders__empty">…</p>`;
  }

  private renderError(): void {
    this.root.innerHTML = `<div class="folders__head">${escapeHtml(t('folder.title'))}</div>
      <p class="folders__empty">${escapeHtml(t('toast.readFailed'))}</p>`;
  }

  private render(entries: FolderEntry[]): void {
    const name = this.current ? baseName(this.current) : '';

    this.root.innerHTML = `
      <div class="folders__head">
        <button class="folders__up" id="folders-up" title="${escapeAttr(t('folder.up'))}"
          aria-label="${escapeAttr(t('folder.up'))}">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 10 3-3 3 3"/></svg>
        </button>
        <span class="folders__name" dir="auto" title="${escapeAttr(this.current ?? '')}">${escapeHtml(name)}</span>
        <button class="folders__close" id="folders-close" title="${escapeAttr(t('folder.close'))}"
          aria-label="${escapeAttr(t('folder.close'))}">${icon(ICONS.close, 12)}</button>
      </div>
      ${
        entries.length === 0
          ? `<p class="folders__empty">${escapeHtml(t('folder.empty'))}</p>`
          : `<div class="folders__list">${entries.map((e) => this.item(e)).join('')}</div>`
      }`;

    this.root.querySelector('#folders-up')?.addEventListener('click', () => void this.goUp());
    this.root.querySelector('#folders-close')?.addEventListener('click', () => {
      this.root.dispatchEvent(new CustomEvent('folders:close', { bubbles: true }));
    });

    this.root.querySelector('.folders__list')?.addEventListener('click', (event) => {
      const btn = (event.target as Element).closest<HTMLElement>('[data-path]');
      if (!btn) return;
      if (btn.dataset.dir === '1') void this.show(btn.dataset.path!);
      else this.onOpenFile(btn.dataset.path!);
    });

    this.setActive(this.activePath);
  }

  private item(entry: FolderEntry): string {
    // The file name decides its own direction, exactly as a heading would.
    const dir = detectDirection(entry.name, 'ltr');
    const glyph = entry.isDir
      ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M1.9 12.6V4a1 1 0 0 1 1-1h3L7.3 4.9h5.8a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1Z"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3.4 1.9h5.4l3.8 3.8v8.4H3.4Z"/><path d="M8.8 1.9v3.8h3.8"/></svg>';

    return `<button class="folders__item${entry.isDir ? ' folders__item--dir' : ''}"
      data-path="${escapeAttr(entry.path)}" data-dir="${entry.isDir ? '1' : '0'}"
      dir="${dir}" title="${escapeAttr(entry.path)}">
      <span class="folders__glyph">${glyph}</span>
      <span class="folders__label">${escapeHtml(entry.name)}</span>
    </button>`;
  }

  private async goUp(): Promise<void> {
    if (!this.current) return;
    const parent = await this.host.parentFolder(this.current).catch(() => null);
    if (parent && parent !== this.current) await this.show(parent);
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
