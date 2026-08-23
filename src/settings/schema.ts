/**
 * B mark — settings schema, defaults, validation and persistence.
 *
 * The frontend owns the schema. Rust just stores an opaque JSON blob (see
 * src-tauri/src/settings.rs), so adding a setting never needs a Rust change
 * or a migration on that side.
 *
 * Persistence has two backends, chosen at runtime:
 *   * Tauri  → %AppData%\app.bmark.viewer\settings.json, written atomically
 *   * browser → localStorage, so `npm run dev` behaves identically
 */

import type { Language } from '../i18n';
import type { ContentThemeName } from '../components/content-themes';

export type Theme = 'light' | 'dark' | 'auto';
export type DirectionMode = 'auto' | 'rtl' | 'ltr';
export type FontChoice = 'vazirmatn' | 'system' | 'mono';
export type AccentName = 'brand' | 'blue' | 'violet' | 'amber' | 'rose' | 'teal';

export interface Settings {
  version: number;

  // Language
  language: Language;

  // Appearance
  theme: Theme;
  accent: AccentName;

  // Typography
  fontSize: number; // px
  lineHeight: number;
  fontWeight: number;
  paragraphSpacing: number; // em
  contentWidth: number; // px
  uiFont: FontChoice;
  contentFont: FontChoice;
  codeFont: FontChoice;

  // Text and direction
  directionMode: DirectionMode;
  codeFollowsProse: boolean;
  syntaxHighlight: boolean;

  // Content and security
  externalImages: boolean;
  rawHtml: boolean;
  confirmLinks: boolean;
  liveReload: boolean;

  // Rendering extras. Both libraries are loaded lazily, so leaving these on
  // costs nothing until a document actually needs them.
  math: boolean;
  diagrams: boolean;
  showFrontMatter: boolean;

  // Workflow
  restoreSession: boolean;
  autoSave: boolean;

  /** Typographic treatment of the document, carried into every export. */
  contentTheme: ContentThemeName;
  /**
   * Off by default and deliberately so: the Persian dictionary costs ~172 MB
   * and ~2 s to build. See assets/dictionaries/README.md.
   */
  spellCheck: boolean;

  // Persian text fixes
  fixLetters: boolean;
  fixZwnj: boolean;
  fixPunctuationSpacing: boolean;
  fixPunctuation: boolean;
  fixDigits: 'fa' | 'en' | 'keep';

  // Session state worth restoring
  zoom: number;
}

export const SETTINGS_VERSION = 2;

/**
 * Settings whose default changed and that must be re-applied once to people
 * who already have a settings file, because a stored `true` would otherwise
 * outlive the decision to stop doing it.
 *
 * v1 -> v2: session restore is off. Reopening yesterday's documents without
 * being asked is a surprise, not a convenience, and it leaks what you were
 * reading to whoever next opens the app.
 */
const MIGRATIONS: Array<{ to: number; apply: (s: Settings) => void }> = [
  { to: 2, apply: (s) => { s.restoreSession = false; } },
];

export const DEFAULTS: Settings = {
  version: SETTINGS_VERSION,

  language: 'en',

  theme: 'auto',
  accent: 'brand',

  fontSize: 16,
  lineHeight: 1.85,
  fontWeight: 400,
  paragraphSpacing: 1.1,
  contentWidth: 860,
  uiFont: 'vazirmatn',
  contentFont: 'vazirmatn',
  codeFont: 'mono',

  directionMode: 'auto',
  codeFollowsProse: false,
  syntaxHighlight: true,

  // Both default to off: a remote image tells its host you opened the
  // document, and raw HTML is the largest attack surface a viewer has.
  externalImages: false,
  rawHtml: false,
  confirmLinks: true,
  liveReload: true,

  math: true,
  diagrams: true,
  showFrontMatter: true,

  restoreSession: false,
  // Off by default: writing to someone's file without them asking is a
  // surprise, however convenient.
  autoSave: false,

  fixLetters: true,
  fixZwnj: true,
  fixPunctuationSpacing: true,
  fixPunctuation: true,
  // Digit style is a house-style decision; rewriting numbers silently is
  // presumptuous.
  fixDigits: 'keep',

  contentTheme: 'default',
  spellCheck: false,

  zoom: 1,
};

/** Allowed ranges. Anything outside is clamped, never rejected. */
export const RANGES = {
  fontSize: { min: 11, max: 32, step: 1 },
  lineHeight: { min: 1.2, max: 2.6, step: 0.05 },
  paragraphSpacing: { min: 0.4, max: 2.4, step: 0.1 },
  contentWidth: { min: 480, max: 1600, step: 20 },
  zoom: { min: 0.6, max: 2.4, step: 0.1 },
} as const;

export const FONT_WEIGHTS = [300, 400, 500, 600, 700] as const;

export const ACCENTS: Record<AccentName, { light: string; dark: string; fill: string; ink: string }> = {
  // Brand lime scores 1.24:1 on white, so the light theme uses a darkened
  // version of the same hue for text and keeps the neon for fills only.
  brand: { light: '#557300', dark: '#BEFB00', fill: '#BEFB00', ink: '#101401' },
  blue: { light: '#0b5cd5', dark: '#6cb1ff', fill: '#2f6feb', ink: '#ffffff' },
  violet: { light: '#6b31d6', dark: '#c4a4ff', fill: '#7c4dff', ink: '#ffffff' },
  amber: { light: '#8a5300', dark: '#ffc266', fill: '#ff9f1a', ink: '#241300' },
  rose: { light: '#b01247', dark: '#ff8fb1', fill: '#f2416f', ink: '#ffffff' },
  teal: { light: '#036b64', dark: '#5fd8cd', fill: '#12b3a6', ink: '#01201d' },
};

export const FONT_STACKS: Record<FontChoice, string> = {
  vazirmatn: "'Vazirmatn', 'Vazirmatn Static', 'Segoe UI', system-ui, sans-serif",
  system: "'Segoe UI', system-ui, 'Vazirmatn', sans-serif",
  // Vazirmatn is appended on purpose: font fallback resolves per glyph, so
  // Latin stays monospaced while Arabic-script characters get real shaping.
  mono: "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', 'Vazirmatn', 'Vazirmatn Static', monospace",
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, range: { min: number; max: number }, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, range.min, range.max)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Merge stored JSON over the defaults, coercing every field.
 *
 * A settings file is user-writable and survives upgrades, so it is untrusted
 * input: a hand-edited `fontSize: 9000` must clamp, not blow up the layout,
 * and an unknown theme name must fall back rather than leave the app blank.
 */
export function normalise(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const from = typeof o.version === 'number' && Number.isFinite(o.version) ? o.version : 0;

  const settings: Settings = {
    version: SETTINGS_VERSION,

    language: pick(o.language, ['en', 'fa'] as const, DEFAULTS.language),

    theme: pick(o.theme, ['light', 'dark', 'auto'] as const, DEFAULTS.theme),
    accent: pick(
      o.accent,
      Object.keys(ACCENTS) as AccentName[],
      DEFAULTS.accent,
    ),

    fontSize: num(o.fontSize, RANGES.fontSize, DEFAULTS.fontSize),
    lineHeight: num(o.lineHeight, RANGES.lineHeight, DEFAULTS.lineHeight),
    fontWeight: FONT_WEIGHTS.includes(o.fontWeight as (typeof FONT_WEIGHTS)[number])
      ? (o.fontWeight as number)
      : DEFAULTS.fontWeight,
    paragraphSpacing: num(o.paragraphSpacing, RANGES.paragraphSpacing, DEFAULTS.paragraphSpacing),
    contentWidth: num(o.contentWidth, RANGES.contentWidth, DEFAULTS.contentWidth),
    uiFont: pick(o.uiFont, ['vazirmatn', 'system', 'mono'] as const, DEFAULTS.uiFont),
    contentFont: pick(o.contentFont, ['vazirmatn', 'system', 'mono'] as const, DEFAULTS.contentFont),
    codeFont: pick(o.codeFont, ['vazirmatn', 'system', 'mono'] as const, DEFAULTS.codeFont),

    directionMode: pick(o.directionMode, ['auto', 'rtl', 'ltr'] as const, DEFAULTS.directionMode),
    codeFollowsProse: bool(o.codeFollowsProse, DEFAULTS.codeFollowsProse),
    syntaxHighlight: bool(o.syntaxHighlight, DEFAULTS.syntaxHighlight),

    externalImages: bool(o.externalImages, DEFAULTS.externalImages),
    rawHtml: bool(o.rawHtml, DEFAULTS.rawHtml),
    confirmLinks: bool(o.confirmLinks, DEFAULTS.confirmLinks),
    liveReload: bool(o.liveReload, DEFAULTS.liveReload),

    math: bool(o.math, DEFAULTS.math),
    diagrams: bool(o.diagrams, DEFAULTS.diagrams),
    showFrontMatter: bool(o.showFrontMatter, DEFAULTS.showFrontMatter),

    restoreSession: bool(o.restoreSession, DEFAULTS.restoreSession),
    autoSave: bool(o.autoSave, DEFAULTS.autoSave),

    fixLetters: bool(o.fixLetters, DEFAULTS.fixLetters),
    fixZwnj: bool(o.fixZwnj, DEFAULTS.fixZwnj),
    fixPunctuationSpacing: bool(o.fixPunctuationSpacing, DEFAULTS.fixPunctuationSpacing),
    fixPunctuation: bool(o.fixPunctuation, DEFAULTS.fixPunctuation),
    fixDigits: pick(o.fixDigits, ['fa', 'en', 'keep'] as const, DEFAULTS.fixDigits),

    contentTheme: pick(
      o.contentTheme,
      ['default', 'academic', 'book', 'compact'] as const,
      DEFAULTS.contentTheme,
    ),
    spellCheck: bool(o.spellCheck, DEFAULTS.spellCheck),

    zoom: num(o.zoom, RANGES.zoom, DEFAULTS.zoom),
  };

  // A file with no version at all is either brand new or hand-written; either
  // way it has not opted into the old behaviour, so it is not migrated.
  if (from > 0) {
    for (const step of MIGRATIONS) if (from < step.to) step.apply(settings);
  }

  return settings;
}
