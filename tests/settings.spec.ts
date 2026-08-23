/**
 * Settings normalisation and persistence.
 *
 * A settings file is user-writable and survives upgrades, so it is untrusted
 * input. These tests pin that a hand-edited or corrupt file degrades to sane
 * values instead of breaking the app.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { normalise, DEFAULTS, RANGES, ACCENTS, FONT_STACKS } from '../src/settings/schema';
import { store } from '../src/settings/store';

describe('normalise — defaults', () => {
  it('returns the defaults for null, undefined and non-objects', () => {
    for (const input of [null, undefined, 42, 'nope', true, []]) {
      expect(normalise(input)).toEqual(DEFAULTS);
    }
  });

  it('defaults the two privacy-sensitive options to off', () => {
    expect(DEFAULTS.externalImages).toBe(false);
    expect(DEFAULTS.rawHtml).toBe(false);
  });

  it('defaults to confirming external links', () => {
    expect(DEFAULTS.confirmLinks).toBe(true);
  });

  it('defaults direction to automatic per-block detection', () => {
    expect(DEFAULTS.directionMode).toBe('auto');
    expect(DEFAULTS.codeFollowsProse).toBe(false);
  });

  it('defaults both interface and content fonts to Vazirmatn', () => {
    expect(DEFAULTS.uiFont).toBe('vazirmatn');
    expect(DEFAULTS.contentFont).toBe('vazirmatn');
  });
});

describe('normalise — clamping', () => {
  const numeric = ['fontSize', 'lineHeight', 'paragraphSpacing', 'contentWidth', 'zoom'] as const;

  for (const key of numeric) {
    it(`clamps ${key} above its maximum`, () => {
      const out = normalise({ [key]: 99999 });
      expect(out[key]).toBe(RANGES[key].max);
    });

    it(`clamps ${key} below its minimum`, () => {
      const out = normalise({ [key]: -99999 });
      expect(out[key]).toBe(RANGES[key].min);
    });

    it(`falls back for a non-numeric ${key}`, () => {
      expect(normalise({ [key]: 'big' })[key]).toBe(DEFAULTS[key]);
      expect(normalise({ [key]: NaN })[key]).toBe(DEFAULTS[key]);
      expect(normalise({ [key]: Infinity })[key]).toBe(DEFAULTS[key]);
    });
  }

  it('keeps a valid in-range value', () => {
    expect(normalise({ fontSize: 20 }).fontSize).toBe(20);
    expect(normalise({ contentWidth: 1200 }).contentWidth).toBe(1200);
  });
});

describe('normalise — enumerations', () => {
  it('rejects an unknown theme', () => {
    expect(normalise({ theme: 'neon' }).theme).toBe(DEFAULTS.theme);
    expect(normalise({ theme: 'dark' }).theme).toBe('dark');
  });

  it('rejects an unknown language', () => {
    expect(normalise({ language: 'de' }).language).toBe(DEFAULTS.language);
    expect(normalise({ language: 'fa' }).language).toBe('fa');
  });

  it('rejects an unknown direction mode', () => {
    expect(normalise({ directionMode: 'sideways' }).directionMode).toBe(DEFAULTS.directionMode);
    expect(normalise({ directionMode: 'rtl' }).directionMode).toBe('rtl');
  });

  it('rejects an unknown accent', () => {
    expect(normalise({ accent: 'chartreuse' }).accent).toBe(DEFAULTS.accent);
    expect(normalise({ accent: 'teal' }).accent).toBe('teal');
  });

  it('rejects an unknown font choice', () => {
    expect(normalise({ codeFont: 'comic' }).codeFont).toBe(DEFAULTS.codeFont);
    expect(normalise({ codeFont: 'system' }).codeFont).toBe('system');
  });

  it('rejects a font weight outside the supported set', () => {
    expect(normalise({ fontWeight: 450 }).fontWeight).toBe(DEFAULTS.fontWeight);
    expect(normalise({ fontWeight: 700 }).fontWeight).toBe(700);
  });

  it('coerces non-boolean booleans to the default', () => {
    expect(normalise({ rawHtml: 'yes' }).rawHtml).toBe(DEFAULTS.rawHtml);
    expect(normalise({ rawHtml: 1 }).rawHtml).toBe(DEFAULTS.rawHtml);
    expect(normalise({ rawHtml: true }).rawHtml).toBe(true);
  });

  it('always stamps the current schema version', () => {
    expect(normalise({ version: 999 }).version).toBe(DEFAULTS.version);
  });

  it('drops unknown keys entirely', () => {
    const out = normalise({ theme: 'dark', evilFlag: true }) as unknown as Record<string, unknown>;
    expect(out.evilFlag).toBeUndefined();
  });
});

describe('accent palette', () => {
  it('defines light, dark, fill and ink for every accent', () => {
    for (const [name, colours] of Object.entries(ACCENTS)) {
      for (const key of ['light', 'dark', 'fill', 'ink'] as const) {
        expect(colours[key], `${name}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('uses the brand lime as the default fill', () => {
    expect(ACCENTS.brand.fill.toUpperCase()).toBe('#BEFB00');
  });

  it('does not use the raw brand lime as light-theme text', () => {
    // #BEFB00 scores 1.24:1 on white. The light variant must be different.
    expect(ACCENTS.brand.light.toUpperCase()).not.toBe('#BEFB00');
  });
});

describe('font stacks', () => {
  it('puts Vazirmatn first for interface and content', () => {
    expect(FONT_STACKS.vazirmatn.startsWith("'Vazirmatn'")).toBe(true);
  });

  it('appends Vazirmatn to the monospace stack for Persian shaping', () => {
    expect(FONT_STACKS.mono).toContain('Vazirmatn');
    expect(FONT_STACKS.mono.indexOf('Cascadia')).toBeLessThan(
      FONT_STACKS.mono.indexOf('Vazirmatn'),
    );
  });

  it('always ends in a generic family', () => {
    for (const stack of Object.values(FONT_STACKS)) {
      expect(stack).toMatch(/(sans-serif|monospace)\s*$/);
    }
  });
});

describe('store', () => {
  beforeEach(async () => {
    localStorage.clear();
    store.reset();
  });

  it('loads defaults when nothing is stored', async () => {
    const s = await store.load();
    expect(s).toEqual(DEFAULTS);
  });

  it('persists a change and reloads it', async () => {
    store.set('theme', 'dark');
    store.set('fontSize', 21);
    await store.save();

    const reloaded = await store.load();
    expect(reloaded.theme).toBe('dark');
    expect(reloaded.fontSize).toBe(21);
  });

  it('clamps on write, not only on load', () => {
    store.set('fontSize', 9000);
    expect(store.current.fontSize).toBe(RANGES.fontSize.max);
  });

  it('survives a corrupt settings file', async () => {
    localStorage.setItem('b-mark.settings', '{ this is not json');
    const s = await store.load();
    expect(s).toEqual(DEFAULTS);
  });

  it('survives a settings file containing valid JSON of the wrong shape', async () => {
    localStorage.setItem('b-mark.settings', '"just a string"');
    const s = await store.load();
    expect(s).toEqual(DEFAULTS);
  });

  it('notifies subscribers on change', () => {
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.set('theme', 'light');
    store.set('zoom', 1.2);
    off();
    store.set('theme', 'dark');
    expect(calls).toBe(2);
  });

  it('applies theme and typography to the document root', () => {
    store.patch({ theme: 'dark', fontSize: 18, zoom: 1.5, contentWidth: 1000 });
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    // Font size is the base size multiplied by zoom.
    expect(root.style.getPropertyValue('--content-font-size')).toBe('27px');
    expect(root.style.getPropertyValue('--content-max-width')).toBe('1000px');
  });

  it('flips the interface direction with the language', () => {
    store.set('language', 'fa');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('fa');

    store.set('language', 'en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('reset() returns every value to its default', () => {
    store.patch({ theme: 'dark', fontSize: 28, language: 'fa', rawHtml: true });
    store.reset();
    expect(store.current).toEqual(DEFAULTS);
  });
});

/**
 * About section.
 *
 * The credit is a promise to a person, so it is pinned by a test: a careless
 * refactor of the panel must fail here rather than quietly drop the name.
 * The links matter too — an <a href> that actually navigates would replace
 * the whole app with a web page, and a frameless window has no back button.
 */
describe('settings panel — about', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.querySelector('#settings-overlay')?.remove();
  });

  it('credits the author and states the licence, in both languages', async () => {
    const { openSettings, closeSettings } = await import('../src/settings/panel');
    const { setLanguage, t } = await import('../src/i18n');

    for (const lang of ['en', 'fa'] as const) {
      setLanguage(lang);
      openSettings(() => {});
      const panel = document.querySelector('#settings-overlay')!;
      const about = panel.querySelector('.about')!;
      expect(about).toBeTruthy();
      expect(about.textContent).toContain(t('about.author'));
      expect(about.textContent).toContain(t('about.free'));
      closeSettings();
    }

    // The English string is the one that carries the actual name.
    setLanguage('en');
    openSettings(() => {});
    expect(document.querySelector('.about')!.textContent).toContain('Masoud Borodayeh');
    closeSettings();
  });

  it('routes about links through the host instead of navigating', async () => {
    const { openSettings, closeSettings } = await import('../src/settings/panel');
    const opened: string[] = [];
    openSettings(
      () => {},
      undefined,
      (url) => opened.push(url),
    );

    const links = Array.from(document.querySelectorAll<HTMLElement>('.about__links a'));
    expect(links.length).toBe(2);
    for (const a of links) {
      // No real destination in href: nothing to navigate to if a handler breaks.
      expect(a.getAttribute('href')).toBe('#');
      expect(a.dataset.external).toMatch(/^https:\/\/github\.com\/borodayeh\/b-mark/);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(opened).toHaveLength(2);
    closeSettings();
  });
});

/**
 * v1 -> v2 migration.
 *
 * Changing a default only helps new users. Someone who already has
 * `restoreSession: true` on disk keeps getting yesterday's documents reopened
 * unless the upgrade actively turns it off, which is what the user asked for.
 */
describe('normalise — migrations', () => {
  it('turns session restore off for an existing v1 file', () => {
    const v1 = { version: 1, restoreSession: true, fontSize: 18 };
    const out = normalise(v1);
    expect(out.restoreSession).toBe(false);
    // Everything else the user chose survives the migration.
    expect(out.fontSize).toBe(18);
    expect(out.version).toBe(2);
  });

  it('leaves an already-migrated file alone', () => {
    const v2 = { version: 2, restoreSession: true };
    expect(normalise(v2).restoreSession).toBe(true);
  });

  it('does not migrate a file with no version — it never opted in', () => {
    expect(normalise({ restoreSession: true }).restoreSession).toBe(true);
  });

  it('defaults to off for a fresh install', () => {
    expect(DEFAULTS.restoreSession).toBe(false);
    expect(normalise({}).restoreSession).toBe(false);
  });
});
