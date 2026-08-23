/**
 * Overflow containment tests (spec §7).
 *
 * jsdom has no layout engine, so these cannot measure pixels. What they *can*
 * do — and what actually protects the requirement — is assert that every
 * construct which could overflow is emitted inside the structure that
 * contains it, and that the stylesheet still carries the rules that do the
 * containing. A refactor that drops `.table-wrap` or deletes
 * `overflow-wrap: anywhere` fails here instead of in a user's window.
 *
 * Real pixel measurement happens in the Playwright pass documented in
 * docs/03-phase-4-10-report.md, which asserts
 * `documentElement.scrollWidth === clientWidth` at 430 px.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInto } from '../src/markdown/pipeline';

const here = dirname(fileURLToPath(import.meta.url));
const readSrc = (p: string) => readFileSync(resolve(here, '..', p), 'utf8');

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main id="host"></main>';
  host = document.getElementById('host')!;
});

describe('structures that contain their own overflow', () => {
  it('wraps every table in a scrollable container', () => {
    renderInto(host, '| a | b |\n|---|---|\n| 1 | 2 |');
    const table = host.querySelector('table')!;
    expect(table.parentElement?.classList.contains('table-wrap')).toBe(true);
  });

  it('wraps a 12-column table too', () => {
    const head = `| ${Array.from({ length: 12 }, (_, i) => i + 1).join(' | ')} |`;
    const sep = `|${'---|'.repeat(12)}`;
    const row = `| ${Array.from({ length: 12 }, () => 'مقدار طولانی').join(' | ')} |`;
    renderInto(host, [head, sep, row].join('\n'));
    expect(host.querySelectorAll('.table-wrap > table')).toHaveLength(1);
  });

  it('wraps every fenced block in a .code-block container', () => {
    renderInto(host, '```js\nconst x = 1\n```');
    const pre = host.querySelector('pre')!;
    expect(pre.parentElement?.classList.contains('code-block')).toBe(true);
  });

  it('caps images with an explicit lazy/async contract', () => {
    renderInto(host, '![a](./huge.png)');
    const img = host.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.hasAttribute('width')).toBe(false); // width is CSS-controlled
  });
});

describe('unbreakable strings survive the pipeline intact', () => {
  const cases: Array<[string, string]> = [
    ['a 130-char English word', 'Supercalifragilisticexpialidociousantidisestablishmentarianismpneumonoultramicroscopicsilicovolcanoconiosisfloccinaucinihilipilification'],
    ['a long unspaced Persian string', 'آیااینکلمهیبسیاربلندبدونهیچفاصلهایمیتواندقاببرنامهراخرابکندیانه'],
    ['a 150-char URL', 'https://example.com/a/very/deeply/nested/path/that/keeps/going/and/going/forever/until/it/becomes/absurd?query=1&another=2&third=3&fourth=4#fragment'],
    ['a deep Windows path', 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\SomeVeryLongApplicationName\\resources\\app\\dist\\assets\\index-a1b2c3d4.js'],
  ];

  for (const [name, text] of cases) {
    it(`renders ${name} without dropping characters`, () => {
      renderInto(host, text);
      // The pipeline must never truncate to "fit"; CSS does the wrapping.
      expect(host.textContent).toContain(text.slice(0, 40));
    });
  }

  it('keeps a long URL inside a single anchor rather than splitting it', () => {
    const url = 'https://example.com/' + 'segment/'.repeat(30);
    renderInto(host, url);
    const anchors = host.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute('data-external')).toBe(url);
  });
});

describe('the stylesheet still carries the containment rules', () => {
  const content = readSrc('src/styles/content.css');
  const app = readSrc('src/styles/app.css');

  it('breaks unbreakable strings in prose', () => {
    expect(content).toMatch(/\.content\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });

  it('sets min-width: 0 on the content column so flex cannot stretch it', () => {
    expect(content).toMatch(/\.content\s*\{[^}]*min-width:\s*0/s);
  });

  it('caps images at the container width', () => {
    expect(content).toMatch(/\.content img\s*\{[^}]*max-width:\s*100%/s);
    expect(content).toMatch(/\.content img\s*\{[^}]*height:\s*auto/s);
  });

  it('confines horizontal scrolling to code blocks', () => {
    expect(content).toMatch(/\.content pre\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it('confines horizontal scrolling to table wrappers', () => {
    expect(content).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it('caps a single table cell so one long word cannot blow up a column', () => {
    expect(content).toMatch(/\.content th,\s*\.content td\s*\{[^}]*max-width:/s);
  });

  it('forbids horizontal scrolling on the preview pane', () => {
    expect(app).toMatch(/\.preview\s*\{[^}]*overflow-x:\s*hidden/s);
  });

  it('keeps the outline sidebar from being widened by a long heading', () => {
    expect(app).toMatch(/\.outline__item\s*\{[^}]*text-overflow:\s*ellipsis/s);
    expect(app).toMatch(/\.outline__item\s*\{[^}]*min-width:\s*0/s);
  });

  it('caps the find bar so it cannot escape a narrow window', () => {
    expect(app).toMatch(/\.find-bar\s*\{[^}]*max-width:\s*calc\(100% - /s);
  });

  it('truncates recent-file names rather than stretching the list', () => {
    expect(app).toMatch(/\.recent__item span\s*\{[^}]*text-overflow:\s*ellipsis/s);
  });

  it('clips the title bar instead of letting it widen the window', () => {
    expect(app).toMatch(/\.titlebar\s*\{[^}]*overflow:\s*hidden/s);
    expect(app).toMatch(/\.titlebar__title\s*\{[^}]*text-overflow:\s*ellipsis/s);
  });

  it('hides all app chrome when printing', () => {
    expect(app).toMatch(/@media print\s*\{[^}]*\.toolbar/s);
    expect(app).toMatch(/@media print\s*\{[^}]*\.outline/s);
  });

  it('forbids the window from scrolling sideways at all', () => {
    expect(app).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/s);
  });

  it('ellipsises the status-bar path instead of widening the bar', () => {
    expect(app).toMatch(/\.statusbar__path\s*\{[^}]*text-overflow:\s*ellipsis/s);
  });

  it('keeps the toast inside the window on a narrow display', () => {
    expect(app).toMatch(/\.toast\s*\{[^}]*max-width:\s*min\(/s);
  });

  it('sheds toolbar controls instead of letting them clip unusably', () => {
    expect(app).toContain('@media (max-width: 720px)');
    expect(app).toContain('@media (max-width: 560px)');
  });
});

describe('bidi isolation for lexical content', () => {
  it('isolates inline code so it cannot reorder Persian prose', () => {
    const content = readSrc('src/styles/content.css');
    expect(content).toMatch(/\.content code\s*\{[^}]*unicode-bidi:\s*isolate/s);
    expect(content).toMatch(/\.content code\s*\{[^}]*direction:\s*ltr/s);
  });

  it('isolates links', () => {
    const content = readSrc('src/styles/content.css');
    expect(content).toMatch(/\.content a\s*\{[^}]*unicode-bidi:\s*isolate/s);
  });

  it('isolates the status-bar file path', () => {
    const app = readSrc('src/styles/app.css');
    expect(app).toMatch(/\.statusbar__path\s*\{[^}]*unicode-bidi:\s*isolate/s);
  });
});

describe('Persian typography hazards in the stylesheet', () => {
  const app = readSrc('src/styles/app.css');
  const content = readSrc('src/styles/content.css');

  it('does not underline <ins> with text-decoration', () => {
    // A drawn underline cuts through Persian descenders (ن ی ش ه ج) and makes
    // the word look corrupted; a bottom border clears them.
    expect(app).toMatch(/\.content ins\s*\{[^}]*text-decoration:\s*none/s);
    expect(app).toMatch(/\.content ins\s*\{[^}]*border-bottom:/s);
  });

  it('uses a bottom border for links, for the same reason', () => {
    expect(content).toMatch(/\.content a\s*\{[^}]*border-bottom:/s);
    expect(content).not.toMatch(/\.content a\s*\{[^}]*text-decoration:\s*underline/s);
  });

  it('isolates footnote markers so they are not reordered in RTL prose', () => {
    expect(app).toMatch(/\.footnote-backref\s*\{[^}]*unicode-bidi:\s*isolate/s);
  });

  it('keeps formulas LTR and isolated', () => {
    expect(app).toMatch(/\.content \.math\s*\{[^}]*direction:\s*ltr/s);
    expect(app).toMatch(/\.content \.math\s*\{[^}]*unicode-bidi:\s*isolate/s);
  });
});
