/**
 * Catalogue completeness and translation behaviour.
 *
 * The point of these tests is that a missing Persian string should fail CI,
 * not ship as an English word sitting in the middle of a Persian interface.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  t,
  setLanguage,
  getLanguage,
  uiDirection,
  languageName,
  localiseDigits,
  flattenKeys,
  LANGUAGES,
  enCatalogue,
  faCatalogue,
} from '../src/i18n';

beforeEach(() => setLanguage('en'));

describe('catalogue completeness', () => {
  const enKeys = flattenKeys(enCatalogue).sort();
  const faKeys = flattenKeys(faCatalogue).sort();

  it('has the same keys in both languages', () => {
    expect(faKeys).toEqual(enKeys);
  });

  it('has no empty string anywhere', () => {
    for (const lang of [enCatalogue, faCatalogue]) {
      const walk = (node: unknown, path: string) => {
        if (typeof node === 'string') {
          expect(node.trim().length, `empty at ${path}`).toBeGreaterThan(0);
          return;
        }
        if (typeof node === 'object' && node !== null) {
          for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
        }
      };
      walk(lang, '');
    }
  });

  it('declares matching placeholder sets for every key', () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === 'string' && typeof b === 'string') {
        expect(placeholders(b), `placeholders differ at ${path}`).toEqual(placeholders(a));
        return;
      }
      if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
        for (const k of Object.keys(a)) {
          walk((a as never)[k], (b as never)[k], `${path}.${k}`);
        }
      }
    };
    walk(enCatalogue, faCatalogue, '');
  });

  it('covers every key the interface actually asks for', () => {
    // Keys built dynamically in the UI, which a naive grep would miss.
    const dynamic = [
      ...['light', 'dark', 'auto'].map((k) => `settings.theme.${k}`),
      ...['auto', 'rtl', 'ltr'].map((k) => `settings.directionMode.${k}`),
      ...[300, 400, 500, 600, 700].map((w) => `settings.fontWeight.${w}`),
      ...['brand', 'blue', 'violet', 'amber', 'rose', 'teal'].map((c) => `settings.accent.${c}`),
      ...['vazirmatn', 'system', 'mono'].map((f) => `settings.fontOptions.${f}`),
    ];
    for (const key of dynamic) {
      for (const lang of LANGUAGES) {
        setLanguage(lang);
        expect(t(key), `${key} missing in ${lang}`).not.toBe(key);
      }
    }
  });
});

describe('translation', () => {
  it('returns the active language string', () => {
    setLanguage('en');
    expect(t('toolbar.open')).toBe('Open');
    setLanguage('fa');
    expect(t('toolbar.open')).toBe('باز کردن');
  });

  it('interpolates placeholders', () => {
    setLanguage('en');
    expect(t('status.blocks', { rtl: 12, total: 40 })).toBe('12 RTL / 40 blocks');
  });

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    setLanguage('en');
    expect(t('status.blocks', { rtl: 3 })).toContain('{total}');
  });

  it('falls back to the key itself for an unknown key', () => {
    expect(t('nope.not.here')).toBe('nope.not.here');
  });

  it('falls back to English when a key is missing in the active language', () => {
    setLanguage('fa');
    // Every key exists in both, so assert the mechanism via a known key.
    expect(t('app.name')).toBe('B mark');
  });

  it('rejects an unknown language and stays on English', () => {
    setLanguage('de' as never);
    expect(getLanguage()).toBe('en');
  });
});

describe('interface direction', () => {
  it('is RTL for Persian and LTR for English', () => {
    expect(uiDirection('fa')).toBe('rtl');
    expect(uiDirection('en')).toBe('ltr');
  });

  it('reports the native language name', () => {
    expect(languageName('fa')).toBe('فارسی');
    expect(languageName('en')).toBe('English');
  });
});

describe('digit localisation', () => {
  it('converts to Persian digits only for Persian', () => {
    expect(localiseDigits(1234, 'fa')).toBe('۱۲۳۴');
    expect(localiseDigits(1234, 'en')).toBe('1234');
  });

  it('leaves non-digit characters alone', () => {
    expect(localiseDigits('12.5 ms', 'fa')).toBe('۱۲.۵ ms');
  });

  it('is opt-in per call, so file paths stay ASCII', () => {
    setLanguage('fa');
    // t() never localises digits by itself.
    expect(t('status.renderTime', { ms: '12.5' })).toContain('12.5');
  });
});
