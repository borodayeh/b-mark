import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownDetailed, slugifyHeading } from '../src/markdown/renderer';
import { sanitize } from '../src/markdown/sanitize';

const r = (src: string, o = {}) => renderMarkdown(src, o);

describe('CommonMark basics', () => {
  it('renders all six heading levels', () => {
    for (let i = 1; i <= 6; i++) {
      expect(r('#'.repeat(i) + ' Title')).toContain(`<h${i}`);
    }
  });

  it('renders emphasis, strong and strikethrough', () => {
    expect(r('*a* **b** ~~c~~')).toMatch(/<em>a<\/em>.*<strong>b<\/strong>.*<s>c<\/s>/);
  });

  it('renders nested ordered and unordered lists', () => {
    const html = r('- a\n  1. b\n  2. c\n- d');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect((html.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('renders blockquotes and horizontal rules', () => {
    expect(r('> quoted')).toContain('<blockquote>');
    expect(r('---\n')).toContain('<hr>');
  });

  it('renders inline code and fenced code', () => {
    expect(r('`x = 1`')).toContain('<code>x = 1</code>');
    expect(r('```js\nlet a = 1\n```')).toContain('class="language-js"');
  });
});

describe('GFM extensions', () => {
  it('renders tables wrapped for overflow containment', () => {
    const html = r('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<div class="table-wrap"><table>');
    expect(html).toContain('</table></div>');
    expect(html).toContain('<th>');
  });

  it('renders task lists with disabled checkboxes', () => {
    const html = r('- [ ] todo\n- [x] done');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('autolinks bare URLs', () => {
    expect(r('see https://example.com now')).toContain('data-external="https://example.com"');
  });

  it('tags fenced blocks with a language chip and forces LTR', () => {
    const html = r('```python\nprint(1)\n```');
    expect(html).toContain('data-lang="python"');
    expect(html).toContain('dir="ltr"');
  });

  it('falls back to plain text for an unknown language without throwing', () => {
    const html = r('```brainfuck\n+++[->+++<]\n```');
    expect(html).toContain('data-lang="brainfuck"');
    expect(html).toContain('+++');
  });
});

describe('links are inert until the shell opens them', () => {
  it('moves external hrefs to data-external and neutralises href', () => {
    const html = r('[x](https://example.com/a?b=1)');
    expect(html).toContain('data-external="https://example.com/a?b=1"');
    expect(html).toContain('href="#"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('keeps in-document anchors addressable', () => {
    expect(r('[x](#section)')).toContain('data-anchor="section"');
  });

  it('marks relative document links separately', () => {
    expect(r('[x](./other.md)')).toContain('data-relative="./other.md"');
  });
});

describe('images', () => {
  it('defers remote images behind data-src', () => {
    const html = r('![alt](https://cdn.example.com/a.png)');
    expect(html).toContain('data-remote="1"');
    expect(html).toContain('data-src="https://cdn.example.com/a.png"');
  });

  it('marks local images for path resolution', () => {
    expect(r('![alt](./img/a.png)')).toContain('data-relative-src="./img/a.png"');
  });

  it('always sets lazy loading', () => {
    expect(r('![a](./a.png)')).toContain('loading="lazy"');
  });
});

describe('Persian heading slugs', () => {
  it('produces a non-empty addressable slug for Persian text', () => {
    const slug = slugifyHeading('نصب و راه‌اندازی');
    expect(slug.length).toBeGreaterThan(0);
    expect(decodeURIComponent(slug)).toContain('نصب');
  });

  it('never returns an empty slug', () => {
    expect(slugifyHeading('!!!')).toBe('section');
    expect(slugifyHeading('')).toBe('section');
  });

  it('emits an id on Persian headings', () => {
    expect(r('## سلام دنیا')).toMatch(/<h2 id="[^"]+"/);
  });
});

describe('security — raw HTML is escaped by default', () => {
  it('escapes a script tag rather than emitting it', () => {
    const html = r('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script');
  });

  it('escapes an iframe', () => {
    expect(r('<iframe src="https://evil"></iframe>')).not.toContain('<iframe');
  });
});

describe('security — sanitize() with raw HTML enabled', () => {
  const withHtml = (src: string) => sanitize(renderMarkdown(src, { allowRawHtml: true }));

  it('strips <script>', () => {
    expect(withHtml('<script>alert(1)</script>')).not.toContain('script');
  });

  it('strips inline event handlers', () => {
    const out = withHtml('<div onclick="alert(1)">hi</div>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('hi');
  });

  it('strips javascript: hrefs', () => {
    const out = withHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('strips iframe, object and embed', () => {
    for (const tag of ['iframe', 'object', 'embed']) {
      expect(withHtml(`<${tag} src="x"></${tag}>`)).not.toContain(`<${tag}`);
    }
  });

  it('strips <style> and style attributes', () => {
    expect(withHtml('<style>body{display:none}</style>')).not.toContain('display:none');
    expect(withHtml('<p style="color:red">x</p>')).not.toContain('color:red');
  });

  it('strips onerror on images', () => {
    expect(withHtml('<img src=x onerror=alert(1)>')).not.toContain('onerror');
  });

  it('disables any surviving checkbox input', () => {
    const out = sanitize(renderMarkdown('- [x] done'));
    expect(out).toContain('disabled');
  });

  it('removes non-checkbox inputs entirely', () => {
    const out = withHtml('<input type="text" name="pw">');
    expect(out).not.toContain('type="text"');
  });

  it('can strip images completely when the setting demands it', () => {
    const out = sanitize(renderMarkdown('![a](./a.png)'), { stripImages: true });
    expect(out).not.toContain('<img');
  });

  it('keeps ordinary formatting intact', () => {
    const out = withHtml('**bold** and `code` and [link](https://a.com)');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('link');
  });
});

describe('Unicode integrity', () => {
  it('preserves ZWNJ in the output', () => {
    expect(r('می‌خواهم')).toContain('\u200c');
  });

  it('preserves Persian digits and quotation marks', () => {
    const html = r('عدد ۱۲۳۴۵ و «نقل‌قول»');
    expect(html).toContain('۱۲۳۴۵');
    expect(html).toContain('«');
  });

  it('preserves emoji', () => {
    expect(r('سلام 👋🏽 دنیا')).toContain('👋🏽');
  });

  it('does not apply typographic replacement by default (safe for Persian)', () => {
    expect(r('نصف -- نیم')).toContain('--');
  });
});

/**
 * The math pre-check decides whether the 261 KB KaTeX chunk is fetched at all.
 *
 * It used to answer "yes" for any `$` in the document, so a Persian shopping
 * list ("price: $100") or a shell snippet ("use $HOME") downloaded and ran a
 * typesetting engine for a document with no formula in it. That is the lazy
 * loading promise broken in the cheapest possible way, and on a metered
 * connection it is not free. The pre-check must therefore apply the same two
 * disambiguation rules the inline parser applies — see the currency cases
 * below, each of which must NOT count as math.
 */
describe('math — the pre-check that decides whether KaTeX is fetched', () => {
  const needs = (src: string) => renderMarkdownDetailed(src).math;

  it('does not call currency math', () => {
    expect(needs('from $5 to $10 dollars')).toBe(false);
    expect(needs('price: $100 only')).toBe(false);
    expect(needs('it costs $5')).toBe(false);
  });

  it('does not call a lone dollar or a shell variable math', () => {
    expect(needs('a lone $ sign')).toBe(false);
    expect(needs('use $HOME and $PATH')).toBe(false);
    expect(needs('100$Discount')).toBe(false);
  });

  it('leaves an escaped dollar alone', () => {
    expect(needs('costs \\$5 and \\$10')).toBe(false);
  });

  it('still finds real inline and block formulas', () => {
    expect(needs('the famous $e=mc^2$ holds')).toBe(true);
    expect(needs('$$\nx = 1\n$$')).toBe(true);
    expect(needs('inline $$a$$ here')).toBe(true);
    expect(needs('a formula $x_1$ and another $y$')).toBe(true);
  });

  it('agrees with the parser: a pre-check hit renders a formula', () => {
    // The pre-check and the inline rule must not disagree, or the document
    // would load KaTeX and then show nothing.
    const html = r('energy $e=mc^2$ total');
    expect(html).toContain('math--inline');
  });
});
