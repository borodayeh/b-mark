/**
 * Settings persistence and live application.
 *
 * `store` is the single source of truth: components read from it, write
 * through `store.set()`, and re-render from the change notification. Nothing
 * reads or writes the DOM's CSS variables directly.
 */

import { normalise, DEFAULTS, ACCENTS, FONT_STACKS, type Settings } from './schema';
import { setLanguage, uiDirection } from '../i18n';
import { getHost, isTauri } from '../platform';

type Listener = (settings: Settings) => void;

class SettingsStore {
  private value: Settings = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;

  get current(): Settings {
    return this.value;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Load persisted settings, falling back to defaults on any failure. */
  async load(): Promise<Settings> {
    let raw: string | null = null;

    try {
      raw = await getHost().loadSettings();
    } catch (error) {
      // A corrupt or unreadable settings file must never stop the app from
      // starting; the user simply gets defaults.
      console.warn('[b-mark] could not load settings, using defaults:', error);
    }

    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn('[b-mark] settings file is not valid JSON, using defaults');
      }
    }

    this.value = normalise(parsed);
    this.apply();
    return this.value;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    // Round-trip through normalise so clamping and coercion apply to every
    // write, not just to what came off disk.
    this.value = normalise({ ...this.value, [key]: value });
    this.apply();
    this.notify();
    this.scheduleSave();
  }

  patch(partial: Partial<Settings>): void {
    this.value = normalise({ ...this.value, ...partial });
    this.apply();
    this.notify();
    this.scheduleSave();
  }

  reset(): void {
    this.value = { ...DEFAULTS };
    this.apply();
    this.notify();
    this.scheduleSave();
  }

  /** Debounced so dragging a slider does not hammer the disk. */
  private scheduleSave(): void {
    if (typeof window === 'undefined') return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 300);
  }

  async save(): Promise<void> {
    const json = JSON.stringify(this.value, null, 2);
    try {
      await getHost().saveSettings(json);
    } catch (error) {
      console.warn('[b-mark] could not save settings:', error);
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.value);
  }

  /**
   * Push the settings into the document: CSS custom properties, theme
   * attribute, and interface language/direction.
   */
  apply(): void {
    if (typeof document === 'undefined') return;
    const s = this.value;
    const root = document.documentElement;

    root.setAttribute('data-theme', s.theme);

    const accent = ACCENTS[s.accent];
    // The light/dark pair is resolved in CSS via a media query for `auto`;
    // here we hand both to the stylesheet and let it choose.
    root.style.setProperty('--accent-light', accent.light);
    root.style.setProperty('--accent-dark', accent.dark);
    root.style.setProperty('--accent-fill', accent.fill);
    root.style.setProperty('--accent-fill-ink', accent.ink);

    root.style.setProperty('--content-font-size', `${s.fontSize * s.zoom}px`);
    root.style.setProperty('--content-line-height', String(s.lineHeight));
    root.style.setProperty('--content-font-weight', String(s.fontWeight));
    root.style.setProperty('--paragraph-spacing', `${s.paragraphSpacing}em`);
    root.style.setProperty('--content-max-width', `${s.contentWidth}px`);

    root.style.setProperty('--font-ui', FONT_STACKS[s.uiFont]);
    root.style.setProperty('--font-content', FONT_STACKS[s.contentFont]);
    root.style.setProperty('--font-code', FONT_STACKS[s.codeFont]);

    // Interface language and chrome direction.
    setLanguage(s.language);
    root.setAttribute('lang', s.language);
    root.setAttribute('dir', uiDirection(s.language));
    // The content root re-asserts its own dir on every render, so flipping
    // the chrome to RTL never leaks into the document being read.
  }
}

export const store = new SettingsStore();
export { isTauri };
export type { Settings };
