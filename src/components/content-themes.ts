/**
 * Content themes.
 *
 * Distinct from the light/dark *interface* theme: this is the typographic
 * treatment of the document itself, and it travels with the HTML export, the
 * DOCX and the printed page. Someone handing in a paper, sending a client
 * brief and reading a long draft wants three different things from the same
 * Markdown.
 *
 * Deliberately four, not twenty-nine. Each is a considered set of decisions
 * about measure, leading and hierarchy; a long list of near-identical colour
 * swaps would be padding.
 *
 * Every theme is direction-agnostic. Nothing here sets `text-align` or any
 * physical side — the direction engine owns that, and a theme that fought it
 * would undo the point of the application.
 */

export type ContentThemeName = 'default' | 'academic' | 'book' | 'compact';

export interface ContentTheme {
  name: ContentThemeName;
  /** CSS custom properties applied to the content root. */
  vars: Record<string, string>;
  /** Extra rules, scoped to `.content[data-theme-content="<name>"]`. */
  css: string;
}

export const CONTENT_THEMES: Record<ContentThemeName, ContentTheme> = {
  /** The app's own reading defaults; the user's settings win over these. */
  default: {
    name: 'default',
    vars: {},
    css: '',
  },

  /**
   * Academic — for a paper or a thesis. Serif body at a conservative measure,
   * numbered headings, generous leading for margin notes, and footnotes that
   * look like footnotes rather than a list at the bottom.
   */
  academic: {
    name: 'academic',
    vars: {
      '--content-max-width': '720px',
      '--content-line-height': '1.9',
      '--paragraph-spacing': '0.9em',
    },
    css: `
      /* Vazirmatn has no serif companion that covers Persian well, so the
         serif is applied to Latin only and Persian keeps Vazirmatn. Font
         fallback is per glyph, which makes this work without markup. */
      .content[data-theme-content='academic'] {
        font-family: 'Georgia', 'Cambria', 'Vazirmatn', 'Vazirmatn Static', serif;
      }
      .content[data-theme-content='academic'] h1,
      .content[data-theme-content='academic'] h2,
      .content[data-theme-content='academic'] h3 {
        font-family: var(--font-ui);
        font-weight: 600;
        border-bottom: 0;
        padding-bottom: 0;
      }
      .content[data-theme-content='academic'] h1 { font-size: 1.7em; }
      .content[data-theme-content='academic'] h2 { font-size: 1.35em; }
      /* Automatic section numbering, which is what a paper wants and what
         nobody wants to maintain by hand in the source. */
      .content[data-theme-content='academic'] { counter-reset: h2 h3; }
      .content[data-theme-content='academic'] h2 { counter-increment: h2; counter-reset: h3; }
      .content[data-theme-content='academic'] h3 { counter-increment: h3; }
      .content[data-theme-content='academic'] h2::before {
        content: counter(h2) '. ';
        color: var(--fg-faint);
      }
      .content[data-theme-content='academic'] h3::before {
        content: counter(h2) '.' counter(h3) '  ';
        color: var(--fg-faint);
      }
      .content[data-theme-content='academic'] blockquote {
        font-size: 0.95em;
        border-inline-start-width: 2px;
      }
      .content[data-theme-content='academic'] .footnotes { font-size: 0.85em; }
    `,
  },

  /**
   * Book — for reading a long draft. Wide leading, a narrow measure, indented
   * paragraphs instead of spaced ones, and quiet headings.
   */
  book: {
    name: 'book',
    vars: {
      '--content-max-width': '640px',
      '--content-line-height': '2',
      '--paragraph-spacing': '0em',
      '--content-font-size': '17px',
    },
    css: `
      .content[data-theme-content='book'] p + p {
        /* Logical property: the indent lands on the correct side in RTL. */
        text-indent: 1.6em;
      }
      .content[data-theme-content='book'] h1,
      .content[data-theme-content='book'] h2,
      .content[data-theme-content='book'] h3 {
        border-bottom: 0;
        padding-bottom: 0;
        font-weight: 600;
        margin-block: 2em 0.8em;
      }
      .content[data-theme-content='book'] h1 { font-size: 1.5em; }
      .content[data-theme-content='book'] h2 { font-size: 1.25em; }
      .content[data-theme-content='book'] blockquote {
        font-style: italic;
        border-inline-start: 0;
        padding-inline: 2em;
      }
      .content[data-theme-content='book'] hr {
        width: 30%;
        margin-inline: auto;
        background: var(--border);
      }
    `,
  },

  /**
   * Compact — for a reference document you scan rather than read: an API note,
   * a changelog, a table-heavy brief. Tight leading, small type, dense tables.
   */
  compact: {
    name: 'compact',
    vars: {
      '--content-max-width': '1000px',
      '--content-line-height': '1.6',
      '--paragraph-spacing': '0.7em',
      '--content-font-size': '14px',
    },
    css: `
      .content[data-theme-content='compact'] h1,
      .content[data-theme-content='compact'] h2,
      .content[data-theme-content='compact'] h3,
      .content[data-theme-content='compact'] h4 {
        margin-block: 1.2em 0.4em;
      }
      .content[data-theme-content='compact'] th,
      .content[data-theme-content='compact'] td {
        padding: 0.3em 0.6em;
        font-size: 0.94em;
      }
      .content[data-theme-content='compact'] li { margin-block: 0.15em; }
      .content[data-theme-content='compact'] pre { padding: 10px 12px; }
      .content[data-theme-content='compact'] .code-block { margin-bottom: 0.8em; }
    `,
  },
};

export const CONTENT_THEME_NAMES = Object.keys(CONTENT_THEMES) as ContentThemeName[];

const STYLE_ID = 'bmark-content-theme';

/**
 * Apply a content theme to an element.
 *
 * The theme's variables are written as inline custom properties rather than a
 * class, so a user setting — a font size they chose deliberately — can still
 * override them by being written afterwards.
 */
export function applyContentTheme(
  root: HTMLElement,
  name: ContentThemeName,
  overrides: Record<string, string> = {},
): void {
  const theme = CONTENT_THEMES[name] ?? CONTENT_THEMES.default;

  root.setAttribute('data-theme-content', theme.name);

  // Clear anything a previous theme set, so switching is not additive.
  for (const t of Object.values(CONTENT_THEMES)) {
    for (const key of Object.keys(t.vars)) root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  // The user's explicit choices are applied last and therefore win.
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key, value);
  }

  ensureStyleSheet();
}

/** All theme rules live in one injected sheet, added once. */
function ensureStyleSheet(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = contentThemeCss();
  document.head.appendChild(style);
}

/** The combined rules, also used by the HTML export and the print sheet. */
export function contentThemeCss(): string {
  return Object.values(CONTENT_THEMES)
    .map((t) => t.css)
    .join('\n');
}

/** Variables for a theme, for baking into an exported file. */
export function contentThemeVars(name: ContentThemeName): Record<string, string> {
  return { ...(CONTENT_THEMES[name] ?? CONTENT_THEMES.default).vars };
}
