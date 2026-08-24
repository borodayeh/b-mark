/**
 * Outline, find, stats and export.
 *
 * The find tests are the important ones here: matching Persian text is where
 * a naive `indexOf` quietly fails, and the failures are invisible — the user
 * just concludes the search is broken.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { renderInto } from '../src/markdown/pipeline';
import { collectOutline } from '../src/components/outline';
import { foldForSearch, findMatches } from '../src/components/find';
import { analyse, countWords } from '../src/components/stats';
import { buildStandaloneHtml } from '../src/components/export';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main id="host"></main>';
  host = document.getElementById('host')!;
});

// ---------------------------------------------------------------- outline --

describe('outline', () => {
  it('lists every heading with its level', () => {
    renderInto(host, '# One\n\n## Two\n\n### Three\n\n## Four');
    const entries = collectOutline(host);
    expect(entries.map((e) => e.level)).toEqual([1, 2, 3, 2]);
    expect(entries.map((e) => e.text)).toEqual(['One', 'Two', 'Three', 'Four']);
  });

  it('carries the direction the engine resolved for each heading', () => {
    renderInto(host, '# نصب و راه‌اندازی\n\n## Installation\n\n### API چیست');
    const entries = collectOutline(host);
    expect(entries.map((e) => e.dir)).toEqual(['rtl', 'ltr', 'rtl']);
  });

  it('uses the anchor plugin ids so clicking scrolls to the real heading', () => {
    renderInto(host, '## نصب');
    const entry = collectOutline(host)[0]!;
    expect(entry.id.length).toBeGreaterThan(0);
    expect(document.getElementById(entry.id)).toBe(entry.element);
  });

  it('invents an id when a heading somehow has none', () => {
    host.innerHTML = '<h2>No id here</h2>';
    const entry = collectOutline(host)[0]!;
    expect(entry.id).toBe('bmark-heading-0');
    expect(host.querySelector('h2')?.id).toBe('bmark-heading-0');
  });

  it('returns an empty list for a document with no headings', () => {
    renderInto(host, 'Just a paragraph.');
    expect(collectOutline(host)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------- find --

describe('search folding', () => {
  it('preserves length, so match offsets stay valid', () => {
    for (const s of ['سلام دنیا', 'می‌خواهم', 'ABC ۱۲۳', 'كتاب']) {
      expect(foldForSearch(s).length, s).toBe(s.length);
    }
  });

  it('stays length-preserving even for characters whose lowercase is longer', () => {
    // 'İ' (U+0130) lowercases to 'i' + combining dot — two code units. If the
    // fold emitted that, every offset after it would shift and the highlight
    // range would land on the wrong characters.
    for (const s of ['İstanbul', 'İZMİR İLE', 'aİbİcİ', '😀 İ emoji']) {
      expect(foldForSearch(s).length, s).toBe(s.length);
    }
  });

  it('folds Arabic yeh and kaf to their Persian forms', () => {
    expect(foldForSearch('كتاب')).toBe(foldForSearch('کتاب'));
    expect(foldForSearch('يك')).toBe(foldForSearch('یک'));
  });

  it('folds Persian and Arabic-Indic digits to ASCII', () => {
    expect(foldForSearch('۱۲۳۴۵')).toBe('12345');
    expect(foldForSearch('٠١٢٣٤')).toBe('01234');
  });

  it('treats ZWNJ as a space so a typed space still matches', () => {
    expect(foldForSearch('می‌خواهم')).toBe('می خواهم');
  });

  it('lowercases Latin', () => {
    expect(foldForSearch('MarkDown')).toBe('markdown');
  });
});

describe('find in document', () => {
  it('finds plain English text, case-insensitively', () => {
    renderInto(host, 'The Quick brown fox. The quick dog.');
    expect(findMatches(host, 'quick')).toHaveLength(2);
  });

  it('finds Persian text', () => {
    renderInto(host, 'این یک متن فارسی است و متن دیگری هم دارد.');
    expect(findMatches(host, 'متن')).toHaveLength(2);
  });

  it('matches across the ی/ي spelling difference', () => {
    renderInto(host, 'اين يک متن است'); // written with Arabic yeh
    expect(findMatches(host, 'این').length).toBeGreaterThan(0);
  });

  it('matches across the ک/ك spelling difference', () => {
    renderInto(host, 'كتاب خوبی است');
    expect(findMatches(host, 'کتاب')).toHaveLength(1);
  });

  it('finds a ZWNJ word when the query uses a space', () => {
    renderInto(host, 'من می‌خواهم بروم');
    expect(findMatches(host, 'می خواهم')).toHaveLength(1);
  });

  it('finds a Persian-digit number typed in ASCII', () => {
    renderInto(host, 'قیمت ۱۲۳۴ تومان');
    expect(findMatches(host, '1234')).toHaveLength(1);
  });

  it('searches inside code blocks too', () => {
    renderInto(host, '```js\nconst answer = 42\n```');
    expect(findMatches(host, 'answer').length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty or whitespace query', () => {
    renderInto(host, 'some text');
    expect(findMatches(host, '')).toHaveLength(0);
    expect(findMatches(host, '   ')).toHaveLength(0);
  });

  it('finds every occurrence within a single text node', () => {
    renderInto(host, 'aaa aaa aaa');
    expect(findMatches(host, 'aaa')).toHaveLength(3);
  });
});

// ------------------------------------------------------------------ stats --

describe('word counting', () => {
  it('counts English words', () => {
    expect(countWords('one two three four')).toBe(4);
  });

  it('counts a ZWNJ compound as one word, not two', () => {
    // "می‌خواهم" is a single word joined by a zero-width non-joiner.
    expect(countWords('می‌خواهم')).toBe(1);
    expect(countWords('من می‌خواهم بروم')).toBe(3);
  });

  it('ignores punctuation-only tokens', () => {
    expect(countWords('hello — world … !')).toBe(2);
  });

  it('counts each CJK ideograph as a word, since there are no spaces', () => {
    expect(countWords('中文测试')).toBe(4);
  });

  it('handles an empty document', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('    ')).toBe(0);
  });
});

describe('document statistics', () => {
  it('counts structural elements', () => {
    renderInto(
      host,
      '# H\n\n## H2\n\ntext\n\n```js\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![i](./a.png)\n\n[l](https://x.com)',
    );
    const s = analyse(host);
    expect(s.headings).toBe(2);
    expect(s.codeBlocks).toBe(1);
    expect(s.tables).toBe(1);
    expect(s.images).toBe(1);
    expect(s.links).toBe(1);
  });

  it('excludes code from the word count, so reading time is not inflated', () => {
    const prose = 'one two three\n\n';
    const code = '```js\n' + 'x '.repeat(500) + '\n```\n\n';
    renderInto(host, prose + code);
    expect(analyse(host).words).toBe(3);
  });

  it('never reports less than one minute', () => {
    renderInto(host, 'short');
    expect(analyse(host).readingMinutes).toBe(1);
  });

  it('estimates Persian more slowly than English, per word', () => {
    const en = 'word '.repeat(1000);
    const fa = 'واژه '.repeat(1000);
    renderInto(host, en);
    const enMin = analyse(host).readingMinutes;
    renderInto(host, fa);
    const faMin = analyse(host).readingMinutes;
    expect(faMin).toBeGreaterThan(enMin);
  });
});

// ----------------------------------------------------------------- export --

describe('standalone HTML export', () => {
  it('produces a complete document', async () => {
    renderInto(host, '# سلام\n\nمتن فارسی و English text.');
    const out = await buildStandaloneHtml({ title: 'note.md', content: host });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('</html>');
    expect(out).toContain('<title>note.md</title>');
  });

  it('keeps the per-block direction attributes', async () => {
    renderInto(host, 'متن فارسی.\n\nEnglish paragraph.');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('dir="ltr"');
  });

  it('restores real hrefs, which are inert inside the app', async () => {
    renderInto(host, '[docs](https://example.com/a)');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).toContain('href="https://example.com/a"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('inlines the stylesheet rather than linking to one', async () => {
    renderInto(host, 'text');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).toContain('<style>');
    expect(out).not.toContain('<link rel="stylesheet"');
  });

  it('contains no remote reference of any kind', async () => {
    renderInto(host, '# Title\n\nSome **text**.');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    // A self-contained file must not phone home when the recipient opens it.
    const remote = out.match(/(?:src|href)\s*=\s*"https?:\/\/[^"]+"/g) ?? [];
    // Only anchors the author wrote are allowed; no stylesheet, font or script.
    for (const ref of remote) {
      expect(ref.startsWith('href='), ref).toBe(true);
    }
    expect(out).not.toMatch(/<script/i);
  });

  it('replaces a blocked remote image with its alt text instead of a broken box', async () => {
    renderInto(host, '![diagram](https://cdn.example.com/a.png)');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).toContain('[diagram]');
  });

  it('does not leak the URL of a blocked remote image into the exported file', async () => {
    // The user blocked that image precisely so its host would not learn they
    // opened the document. Carrying the URL into a file they then email would
    // undo that.
    renderInto(host, '![diagram](https://tracker.example.com/pixel.png)');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).not.toContain('tracker.example.com');
  });

  it('strips the app\'s internal bookkeeping attributes from the markup', async () => {
    renderInto(host, 'متن\n\n[l](https://x.com)');
    const out = await buildStandaloneHtml({ title: 'x', content: host });

    // Scope to the body: the inlined stylesheet legitimately mentions these
    // attribute names in selectors and comments, which is not a leak.
    const markup = out.slice(out.indexOf('</style>'));

    for (const attr of ['data-bmark-dir', 'data-external', 'data-anchor', 'data-remote']) {
      expect(markup, attr).not.toContain(attr);
    }
    // The visible direction must survive the stripping.
    expect(markup).toContain('dir="rtl"');
    // And the link must have become a real one.
    expect(markup).toContain('href="https://x.com"');
  });

  it('drops the copy buttons, which are chrome rather than content', async () => {
    renderInto(host, '```js\nx\n```');
    host.querySelector('.code-block')?.insertAdjacentHTML('beforeend', '<button class="code-copy">c</button>');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).not.toContain('code-copy');
  });

  it('escapes the title so a crafted file name cannot inject markup', async () => {
    renderInto(host, 'x');
    const out = await buildStandaloneHtml({ title: '<script>alert(1)</script>.md', content: host });
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

// --------------------------------------------------------- front matter --

describe('YAML front matter', () => {
  it('renders a metadata card instead of a rule and a mangled heading', () => {
    renderInto(host, '---\ntitle: گزارش سالانه\nauthor: علی\n---\n\n# متن');
    const card = host.querySelector('.frontmatter');
    expect(card).toBeTruthy();
    expect(card?.querySelector('.frontmatter__title')?.textContent).toBe('گزارش سالانه');
    expect(host.querySelector('hr')).toBeNull();
  });

  it('resolves direction per field', () => {
    renderInto(host, '---\ntitle: گزارش\ndate: 2026-08-23\n---\n\ntext');
    const title = host.querySelector('.frontmatter__title');
    expect(title?.getAttribute('dir')).toBe('rtl');
    const rows = Array.from(host.querySelectorAll('.frontmatter__row'));
    const date = rows.find((r) => r.textContent?.includes('2026'));
    expect(date?.getAttribute('dir')).toBe('ltr');
  });

  it('reads inline and block lists', () => {
    renderInto(host, '---\ntags: [alpha, beta]\nauthors:\n  - Ali\n  - Maryam\n---\n\nx');
    const values = Array.from(host.querySelectorAll('.frontmatter__value')).map((v) => v.textContent);
    expect(values).toEqual(expect.arrayContaining(['alpha', 'beta', 'Ali', 'Maryam']));
  });

  it('strips quotes from values', () => {
    renderInto(host, '---\ntitle: "Quoted Title"\n---\n\nx');
    expect(host.querySelector('.frontmatter__title')?.textContent).toBe('Quoted Title');
  });
});

describe('front matter — the data-loss regression', () => {
  // markdown-it-front-matter treated an unterminated `---` as running to the
  // end of the file, so a document beginning with a horizontal rule rendered
  // as a completely blank page. Losing the user's document to a formatting
  // guess is not an acceptable failure mode.
  it('a bare --- at the start is a horizontal rule, not front matter', () => {
    renderInto(host, '---\n');
    expect(host.querySelector('hr')).toBeTruthy();
    expect(host.querySelector('.frontmatter')).toBeNull();
  });

  it('NEVER swallows the document after an unterminated ---', () => {
    renderInto(host, '---\n\nThis text must survive.');
    expect(host.textContent).toContain('This text must survive.');
  });

  it('keeps everything after an unterminated front-matter-looking block', () => {
    renderInto(host, '---\ntitle: X\n\n# Real Heading\n\nBody text.');
    expect(host.textContent).toContain('Real Heading');
    expect(host.textContent).toContain('Body text.');
  });

  it('treats an empty --- --- pair as two rules, not empty metadata', () => {
    renderInto(host, '---\n---\n\ntext');
    expect(host.querySelector('.frontmatter')).toBeNull();
    expect(host.textContent).toContain('text');
  });

  it('leaves a mid-document --- alone', () => {
    renderInto(host, 'before\n\n---\n\nafter');
    expect(host.querySelector('.frontmatter')).toBeNull();
    expect(host.textContent).toContain('before');
    expect(host.textContent).toContain('after');
  });

  it('accepts ... as the YAML terminator', () => {
    renderInto(host, '---\ntitle: X\n...\n\nbody');
    expect(host.querySelector('.frontmatter')).toBeTruthy();
    expect(host.textContent).toContain('body');
  });
});

// ---------------------------------------------------- math and diagrams --

describe('math', () => {
  it('emits an inline placeholder that KaTeX fills in later', () => {
    renderInto(host, 'فرمول $E = mc^2$ در متن');
    const m = host.querySelector('.math--inline');
    expect(m?.getAttribute('data-latex')).toBe('E = mc^2');
    // Notation is LTR in every language.
    expect(m?.getAttribute('dir')).toBe('ltr');
  });

  it('emits a block placeholder', () => {
    renderInto(host, '$$\n\\int_0^1 x\\,dx\n$$');
    expect(host.querySelector('.math--block')).toBeTruthy();
  });

  it('leaves a lone dollar sign alone', () => {
    renderInto(host, 'قیمت 100 $ است');
    expect(host.querySelector('.math')).toBeNull();
  });

  it('leaves an escaped dollar alone', () => {
    renderInto(host, 'cost \\$5 and \\$6');
    expect(host.querySelector('.math')).toBeNull();
  });

  it('does not treat currency pairs as a formula', () => {
    renderInto(host, 'from $5 to $10 dollars');
    expect(host.querySelector('.math')).toBeNull();
  });

  it('can be switched off', () => {
    renderInto(host, 'x $a+b$ y', { math: false });
    expect(host.querySelector('.math')).toBeNull();
    expect(host.textContent).toContain('$a+b$');
  });

  it('keeps the surrounding Persian paragraph RTL', () => {
    renderInto(host, 'مقدار $x$ را حساب کنید.');
    expect(host.querySelector('p')?.getAttribute('dir')).toBe('rtl');
  });
});

describe('extra markdown syntax', () => {
  it('renders footnotes', () => {
    renderInto(host, 'متن با پانویس[^1]\n\n[^1]: توضیح');
    expect(host.querySelector('.footnote-ref')).toBeTruthy();
    expect(host.querySelector('.footnotes')).toBeTruthy();
  });

  it('renders definition lists', () => {
    renderInto(host, 'اصطلاح\n: تعریف');
    expect(host.querySelector('dl dt')?.textContent).toBe('اصطلاح');
    expect(host.querySelector('dl dd')?.textContent).toContain('تعریف');
  });

  it('renders ==mark==, ++ins++, ~sub~ and ^sup^', () => {
    renderInto(host, '==h== ++i++ H~2~O x^2^');
    expect(host.querySelector('mark')).toBeTruthy();
    expect(host.querySelector('ins')).toBeTruthy();
    expect(host.querySelector('sub')).toBeTruthy();
    expect(host.querySelector('sup')).toBeTruthy();
  });

  it('leaves a mermaid fence as code until the library renders it', () => {
    renderInto(host, '```mermaid\ngraph TD; A-->B;\n```');
    expect(host.querySelector('.code-block[data-lang="mermaid"]')).toBeTruthy();
  });
});

describe('math — currency disambiguation', () => {
  // Prose is full of currency, and Pandoc's two rules are what keep
  // "from $5 to $10" from parsing as a formula containing "5 to ".
  const notMath = [
    'from $5 to $10 dollars',
    'قیمت $۵ تا $۱۰ است',
    'costs $20 and $30',
    'a $ b $ c',
  ];
  for (const src of notMath) {
    it(`does not treat "${src}" as math`, () => {
      renderInto(host, src);
      expect(host.querySelector('.math')).toBeNull();
    });
  }

  const isMath = ['$x+y$', 'value $a_1$ here', 'مقدار $\\alpha$ است'];
  for (const src of isMath) {
    it(`still recognises "${src}"`, () => {
      renderInto(host, src);
      expect(host.querySelector('.math')).toBeTruthy();
    });
  }
});
