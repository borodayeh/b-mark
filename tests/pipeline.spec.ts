import { describe, expect, it, beforeEach } from 'vitest';
import { renderInto } from '../src/markdown/pipeline';

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="host"></main>';
  host = document.getElementById('host')!;
});

const dirOf = (sel: string) => host.querySelector(sel)?.getAttribute('dir');

describe('pipeline — per-block direction in a mixed document', () => {
  it('gives each paragraph its own correct direction', () => {
    renderInto(
      host,
      [
        'This is an English paragraph about software.',
        '',
        'این یک پاراگراف کاملاً فارسی است.',
        '',
        'هذه فقرة عربية.',
      ].join('\n'),
    );

    const ps = Array.from(host.querySelectorAll('p'));
    expect(ps).toHaveLength(3);
    expect(ps[0]!.getAttribute('dir')).toBe('ltr');
    expect(ps[1]!.getAttribute('dir')).toBe('rtl');
    expect(ps[2]!.getAttribute('dir')).toBe('rtl');
  });

  it('keeps a Persian paragraph RTL even when it opens with inline code', () => {
    renderInto(host, 'دستور `npm install` را در ترمینال اجرا کنید.');
    expect(dirOf('p')).toBe('rtl');
  });

  it('keeps a Persian paragraph RTL even when it opens with a URL', () => {
    renderInto(host, 'https://github.com را باز کنید و مخزن را فورک کنید.');
    expect(dirOf('p')).toBe('rtl');
  });

  it('keeps a Persian paragraph RTL when it contains an English file path', () => {
    renderInto(host, 'فایل را در C:\\Users\\Ali\\Documents\\note.md ذخیره کنید.');
    expect(dirOf('p')).toBe('rtl');
  });

  it('keeps a Persian paragraph RTL when it contains English numbers', () => {
    renderInto(host, 'در سال 2026 حدود 1200 نفر شرکت کردند.');
    expect(dirOf('p')).toBe('rtl');
  });

  it('keeps an English paragraph LTR when it contains Persian digits', () => {
    renderInto(host, 'The build produced ۱۲۳ artifacts in total.');
    expect(dirOf('p')).toBe('ltr');
  });
});

describe('pipeline — headings, quotes and lists', () => {
  it('resolves each heading independently', () => {
    renderInto(host, '# نصب و راه‌اندازی\n\n## Installation\n\n### API چیست');
    expect(dirOf('h1')).toBe('rtl');
    expect(dirOf('h2')).toBe('ltr');
    expect(dirOf('h3')).toBe('rtl');
  });

  it('resolves list items individually and orients the list by majority', () => {
    renderInto(host, '- مورد اول\n- مورد دوم\n- third item in English');
    const items = Array.from(host.querySelectorAll('li'));
    expect(items[0]!.getAttribute('dir')).toBe('rtl');
    expect(items[1]!.getAttribute('dir')).toBe('rtl');
    expect(items[2]!.getAttribute('dir')).toBe('ltr');
    // Two of three are RTL, so the bullets belong on the right.
    expect(dirOf('ul')).toBe('rtl');
  });

  it('an all-English list keeps LTR bullets', () => {
    renderInto(host, '- alpha\n- beta\n- gamma');
    expect(dirOf('ul')).toBe('ltr');
  });

  it('a numeric-only list item inherits from its RTL siblings', () => {
    renderInto(host, '- مورد فارسی\n- ۱۲۳۴۵\n- مورد دیگر');
    const items = Array.from(host.querySelectorAll('li'));
    expect(items[1]!.getAttribute('dir')).toBe('rtl');
  });

  it('resolves blockquote direction', () => {
    renderInto(host, '> این یک نقل‌قول فارسی است.');
    expect(dirOf('blockquote')).toBe('rtl');
  });

  it('resolves nested list items against their own text', () => {
    renderInto(host, '- outer english item\n  - مورد فارسی تو در تو');
    const items = Array.from(host.querySelectorAll('li'));
    expect(items[0]!.getAttribute('dir')).toBe('ltr');
    expect(items[items.length - 1]!.getAttribute('dir')).toBe('rtl');
  });
});

describe('pipeline — tables', () => {
  it('orients a Persian table RTL and an English table LTR', () => {
    renderInto(host, '| نام | سن |\n|---|---|\n| علی | ۳۰ |\n| رضا | ۲۵ |');
    expect(dirOf('table')).toBe('rtl');

    renderInto(host, '| Name | Age |\n|---|---|\n| Ali | 30 |');
    expect(dirOf('table')).toBe('ltr');
  });

  it('gives individual cells their own direction in a mixed table', () => {
    renderInto(
      host,
      '| کلید | Value |\n|---|---|\n| نام کاربری | admin |\n| رمز عبور | secret |',
    );
    const cells = Array.from(host.querySelectorAll('td'));
    expect(cells[0]!.getAttribute('dir')).toBe('rtl');
    expect(cells[1]!.getAttribute('dir')).toBe('ltr');
  });

  it('always wraps tables for overflow containment', () => {
    renderInto(host, '| a | b |\n|---|---|\n| 1 | 2 |');
    expect(host.querySelector('.table-wrap > table')).toBeTruthy();
  });
});

describe('pipeline — code and links stay LTR', () => {
  it('forces fenced code LTR inside an RTL document', () => {
    renderInto(host, 'توضیح فارسی:\n\n```js\nconst a = 1\n```');
    expect(dirOf('pre')).toBe('ltr');
    expect(host.querySelector('.code-block')?.getAttribute('dir')).toBe('ltr');
  });

  it('forces inline code LTR inside a Persian paragraph', () => {
    renderInto(host, 'مقدار `x = 1` را بررسی کنید.');
    expect(dirOf('p')).toBe('rtl');
    expect(dirOf('code')).toBe('ltr');
  });

  it('forces a link whose visible text is a URL to LTR', () => {
    renderInto(host, 'آدرس https://example.com/path را ببینید.');
    expect(dirOf('p')).toBe('rtl');
    expect(dirOf('a')).toBe('ltr');
  });

  it('lets code follow the prose when the user opts in', () => {
    renderInto(host, 'توضیح فارسی:\n\n```\nمتن فارسی داخل کد\n```', {
      codeFollowsProse: true,
    });
    expect(host.querySelector('pre')?.getAttribute('dir')).not.toBe('ltr');
  });
});

describe('pipeline — forced direction mode', () => {
  it('mode=rtl puts one dir on the root and clears per-block dirs', () => {
    renderInto(host, 'English text here.\n\nمتن فارسی.', { mode: 'rtl' });
    expect(host.getAttribute('dir')).toBe('rtl');
    for (const p of Array.from(host.querySelectorAll('p'))) {
      expect(p.hasAttribute('data-bmark-dir')).toBe(false);
    }
  });

  it('mode=ltr forces the whole document LTR', () => {
    renderInto(host, 'متن کاملاً فارسی.', { mode: 'ltr' });
    expect(host.getAttribute('dir')).toBe('ltr');
  });

  it('code stays LTR even in forced RTL mode', () => {
    renderInto(host, 'متن\n\n```js\nlet a\n```', { mode: 'rtl' });
    expect(dirOf('pre')).toBe('ltr');
  });
});

describe('pipeline — reporting and robustness', () => {
  it('reports how many blocks resolved RTL', () => {
    const res = renderInto(host, 'english\n\nفارسی\n\nفارسی دیگر');
    expect(res.rtlBlocks).toBe(2);
  });

  it('renders an empty document without throwing', () => {
    expect(() => renderInto(host, '')).not.toThrow();
  });

  it('handles a large document in reasonable time', () => {
    const block = 'این یک پاراگراف فارسی است با کمی English mixed in.\n\n';
    const res = renderInto(host, block.repeat(2000));
    expect(host.querySelectorAll('p').length).toBe(2000);
    // Generous ceiling — the point is that it is not quadratic.
    expect(res.elapsedMs).toBeLessThan(5000);
  });

  it('never leaves a block without a resolved direction in auto mode', () => {
    renderInto(host, '# سلام\n\nمتن\n\n- a\n- ب\n\n> نقل\n\n| x | ی |\n|---|---|\n| 1 | ۲ |');
    for (const el of Array.from(host.querySelectorAll('p, h1, li, blockquote, td, th'))) {
      expect(['rtl', 'ltr']).toContain(el.getAttribute('dir'));
    }
  });
});

describe('neutral fallback follows the reader, not a hard-coded default', () => {
  // A block with no strong character at all — a numeric cell, a line of
  // punctuation, a code-only paragraph — has to resolve to *something*.
  // Hard-coding that to LTR left a Persian reader with a left-aligned page
  // even with the mode on Auto.
  const neutral = '۱۲۳۴۵\n\n***\n\n`git status`';

  it('resolves neutral blocks RTL for a Persian reader', () => {
    renderInto(host, neutral, { fallback: 'rtl' });
    for (const el of Array.from(host.querySelectorAll('[data-bmark-dir]'))) {
      expect(el.getAttribute('dir')).toBe('rtl');
    }
    expect(host.getAttribute('dir')).toBe('rtl');
  });

  it('resolves them LTR for an English reader', () => {
    renderInto(host, neutral, { fallback: 'ltr' });
    expect(host.getAttribute('dir')).toBe('ltr');
  });

  it('never lets the fallback override a block with real evidence', () => {
    renderInto(host, 'This paragraph is unambiguously English.', { fallback: 'rtl' });
    expect(host.querySelector('p')?.getAttribute('dir')).toBe('ltr');
  });

  it('and the same the other way round', () => {
    renderInto(host, 'این پاراگراف بی‌تردید فارسی است.', { fallback: 'ltr' });
    expect(host.querySelector('p')?.getAttribute('dir')).toBe('rtl');
  });
});
