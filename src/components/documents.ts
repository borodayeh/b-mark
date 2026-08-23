/**
 * Open documents and the tab strip.
 *
 * A viewer that can only hold one file forces you to re-open the previous one
 * every time you follow a reference, which is why every editor grows tabs.
 *
 * Two decisions worth stating:
 *
 *   * **Unsaved buffers are never closed silently.** Closing a dirty tab asks
 *     first; closing the window asks about every dirty tab.
 *   * **The session is restored by path, not by content.** Storing the text of
 *     every open document in localStorage would duplicate the user's files
 *     into browser storage, which is both wasteful and a small privacy
 *     surprise. On launch the paths are re-read from disk; a file that has
 *     moved is dropped with a note rather than restored as a stale copy.
 */

import { detectDirection } from '../direction/unicode';

export interface DocumentTab {
  id: string;
  path: string;
  name: string;
  /** Current buffer. */
  source: string;
  /** What is on disk, so `dirty` is a comparison rather than a guess. */
  saved: string;
  /** Set when the file changed on disk while this buffer was dirty. */
  staleOnDisk: boolean;
  /** Preserved so switching tabs returns you where you were. */
  scrollTop: number;
  /** Direction of the file name, for the tab label. */
  dir: 'rtl' | 'ltr';
}

const SESSION_KEY = 'b-mark.session';
const MAX_RESTORED = 12;

let seq = 0;

export class DocumentSet {
  private tabs: DocumentTab[] = [];
  private activeId: string | null = null;

  get all(): readonly DocumentTab[] {
    return this.tabs;
  }

  get active(): DocumentTab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  get count(): number {
    return this.tabs.length;
  }

  isDirty(tab: DocumentTab): boolean {
    return tab.source !== tab.saved;
  }

  get anyDirty(): boolean {
    return this.tabs.some((t) => this.isDirty(t));
  }

  /** Open a file, or focus it if it is already open. */
  open(file: { path: string; name: string; content: string }): DocumentTab {
    const existing = this.tabs.find((t) => t.path === file.path);
    if (existing) {
      // Re-opening a clean tab refreshes it; a dirty one keeps the user's work.
      if (!this.isDirty(existing)) {
        existing.source = file.content;
        existing.saved = file.content;
        existing.staleOnDisk = false;
      }
      this.activeId = existing.id;
      return existing;
    }

    const tab: DocumentTab = {
      id: `tab-${seq++}`,
      path: file.path,
      name: file.name,
      source: file.content,
      saved: file.content,
      staleOnDisk: false,
      scrollTop: 0,
      dir: detectDirection(file.name),
    };
    this.tabs.push(tab);
    this.activeId = tab.id;
    return tab;
  }

  activate(id: string): DocumentTab | null {
    if (!this.tabs.some((t) => t.id === id)) return null;
    this.activeId = id;
    return this.active;
  }

  /** Close a tab and focus a sensible neighbour. */
  close(id: string): void {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    this.tabs.splice(index, 1);

    if (this.activeId !== id) return;
    // Prefer the tab to the right, as browsers do; fall back to the left.
    const next = this.tabs[index] ?? this.tabs[index - 1] ?? null;
    this.activeId = next?.id ?? null;
  }

  closeOthers(id: string): void {
    this.tabs = this.tabs.filter((t) => t.id === id);
    this.activeId = this.tabs[0]?.id ?? null;
  }

  closeAll(): void {
    this.tabs = [];
    this.activeId = null;
  }

  /** Cycle with Ctrl+Tab / Ctrl+Shift+Tab. */
  cycle(direction: 1 | -1): DocumentTab | null {
    if (this.tabs.length < 2) return this.active;
    const index = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = (index + direction + this.tabs.length) % this.tabs.length;
    this.activeId = this.tabs[next]!.id;
    return this.active;
  }

  /** Jump to the nth tab with Ctrl+1..9; 9 means "the last one", as in browsers. */
  activateByIndex(n: number): DocumentTab | null {
    const tab = n === 9 ? this.tabs[this.tabs.length - 1] : this.tabs[n - 1];
    if (!tab) return null;
    this.activeId = tab.id;
    return tab;
  }

  // --------------------------------------------------------------- session --

  /** Persist the paths of the open tabs, not their contents. */
  /**
   * Remember which paths are open, for the next launch.
   *
   * `enabled` is the user's setting. When it is off nothing is recorded *and*
   * any previously recorded list is deleted — leaving a stale record of what
   * someone was reading behind a switch they turned off would be a privacy
   * bug, not just a dead feature.
   */
  saveSession(enabled = true): void {
    if (!enabled) {
      DocumentSet.clearSession();
      return;
    }
    try {
      const payload = {
        paths: this.tabs
          .map((t) => t.path)
          // The bundled sample is not a file on disk.
          .filter((p) => p && !p.startsWith('tests/'))
          .slice(0, MAX_RESTORED),
        active: this.active?.path ?? null,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      /* private mode; the session simply does not persist */
    }
  }

  static readSession(): { paths: string[]; active: string | null } {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return { paths: [], active: null };
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { paths: [], active: null };
      const { paths, active } = parsed as { paths?: unknown; active?: unknown };
      return {
        paths: Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [],
        active: typeof active === 'string' ? active : null,
      };
    } catch {
      return { paths: [], active: null };
    }
  }

  static clearSession(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* nothing to do */
    }
  }
}
