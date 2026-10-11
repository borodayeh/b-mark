/**
 * Document outline.
 *
 * Built from the rendered DOM rather than the Markdown source, so the headings
 * it lists are exactly the ones on screen, with the ids the anchor plugin
 * actually produced — including the percent-encoded Persian ones.
 *
 * Each entry carries its own direction, resolved by the same engine that
 * resolved the heading itself. Without that, a sidebar listing "۱. مقدمه" next
 * to "2. Installation" would left-align both and read wrong.
 */

import { detectDirection } from '../direction/unicode';
import { t } from '../i18n';

export interface OutlineEntry {
  id: string;
  text: string;
  level: number;
  dir: 'rtl' | 'ltr';
  element: HTMLElement;
}

export function collectOutline(content: HTMLElement): OutlineEntry[] {
  const headings = Array.from(
    content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
  );

  return headings.map((h, index) => {
    // markdown-it-anchor gives every heading an id, but a document rendered
    // before the plugin ran (or with duplicate slugs) might not have one.
    if (!h.id) h.id = `bmark-heading-${index}`;
    const text = (h.textContent ?? '').trim();
    const attr = h.getAttribute('dir');
    return {
      id: h.id,
      text,
      level: Number(h.tagName[1]),
      dir: attr === 'rtl' || attr === 'ltr' ? attr : detectDirection(text),
      element: h,
    };
  });
}

export class Outline {
  private root: HTMLElement;
  private entries: OutlineEntry[] = [];
  private activeId: string | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'outline';
    this.root.setAttribute('role', 'navigation');
    this.root.setAttribute('aria-label', t('outline.title'));
  }

  /** Rebuild from the current document and start tracking the scroll position. */
  update(content: HTMLElement, scroller: HTMLElement): void {
    this.entries = collectOutline(content);
    this.render();
    this.observe(scroller);
  }

  private render(): void {
    if (this.entries.length === 0) {
      this.root.innerHTML = `
        <div class="outline__head">${t('outline.title')}</div>
        <p class="outline__empty">${t('outline.empty')}</p>`;
      return;
    }

    // Normalise so a document that starts at H2 is not indented by a level it
    // never uses.
    const minLevel = Math.min(...this.entries.map((e) => e.level));

    this.root.innerHTML = `
      <div class="outline__head">${t('outline.title')}</div>
      <nav class="outline__list">
        ${this.entries
          .map(
            (e) => `<button class="outline__item" data-id="${escapeAttr(e.id)}"
              data-depth="${Math.min(e.level - minLevel, 3)}" dir="${e.dir}"
              title="${escapeAttr(e.text)}">${escapeHtml(e.text)}</button>`,
          )
          .join('')}
      </nav>`;

    this.root.querySelector('.outline__list')?.addEventListener('click', (event) => {
      const btn = (event.target as Element).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      const entry = this.entries.find((e) => e.id === btn.dataset.id);
      entry?.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    this.highlight();
  }

  /**
   * Highlight the heading the reader is currently under.
   *
   * A plain "topmost visible heading" rule flickers when a heading sits right
   * at the boundary, so the root margin pins the trigger line near the top of
   * the viewport and the last heading to cross it wins.
   */
  private observe(scroller: HTMLElement): void {
    this.observer?.disconnect();
    if (this.entries.length === 0) return;

    const seen = new Set<string>();
    this.observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting) seen.add(r.target.id);
          else seen.delete(r.target.id);
        }
        const first = this.entries.find((e) => seen.has(e.id));
        if (first && first.id !== this.activeId) {
          this.activeId = first.id;
          this.highlight();
        }
      },
      { root: scroller, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    for (const e of this.entries) this.observer.observe(e.element);
  }

  private highlight(): void {
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('.outline__item'))) {
      const on = el.dataset.id === this.activeId;
      el.classList.toggle('outline__item--active', on);
      if (on) {
        // Keep the active entry visible without yanking the whole page.
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
