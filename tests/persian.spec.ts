import { describe, expect, it } from 'vitest';
import {
  fixPersianText,
  isPersianText,
  DEFAULT_FIX_OPTIONS,
  ZWNJ_CHAR,
} from '../src/persian/fix';
import { wordAtOffset } from '../src/persian/words';

const fix = (s: string, o = {}) => fixPersianText(s, o).text;
const Z = ZWNJ_CHAR;

describe('letter normalisation', () => {
  it('converts Arabic yeh and kaf to their Persian forms', () => {
    expect(fix('اين يك متن است')).toContain('این یک');
  });

  it('converts teh marbuta and hamzated alefs', () => {
    expect(fix('مدرسة')).toBe('مدرسه');
    expect(fix('أحمد إسم')).toBe('احمد اسم');
  });

  it('leaves already-correct Persian untouched', () => {
    const s = 'این یک متن درست فارسی است';
    expect(fix(s)).toBe(s);
  });
});

describe('ZWNJ insertion', () => {
  it('joins the می prefix to its verb', () => {
    expect(fix('من می خواهم بروم')).toBe(`من می${Z}خواهم بروم`);
  });

  it('joins the نمی prefix', () => {
    expect(fix('او نمی داند')).toBe(`او نمی${Z}داند`);
  });

  it('joins the ها plural suffix', () => {
    expect(fix('کتاب ها را بردم')).toBe(`کتاب${Z}ها را بردم`);
  });

  it('joins comparative suffixes', () => {
    expect(fix('بزرگ تر و بزرگ ترین')).toBe(`بزرگ${Z}تر و بزرگ${Z}ترین`);
  });

  it('handles several in one sentence', () => {
    expect(fix('کتاب های خوب را می خوانم')).toBe(`کتاب${Z}های خوب را می${Z}خوانم`);
  });

  it('never produces a doubled ZWNJ', () => {
    expect(fix(`می${Z} خواهم`)).not.toContain(Z + Z);
  });

  it('leaves an existing correct ZWNJ alone', () => {
    const s = `می${Z}خواهم`;
    expect(fix(s)).toBe(s);
  });
});

describe('punctuation', () => {
  it('removes the space before Persian punctuation', () => {
    expect(fix('سلام ، حال شما چطور است ؟')).toBe('سلام، حال شما چطور است؟');
  });

  it('adds the missing space after a comma', () => {
    expect(fix('یک،دو،سه')).toBe('یک، دو، سه');
  });

  it('converts ASCII punctuation in Persian prose', () => {
    expect(fix('سلام ? بله ;')).toContain('؟');
  });

  it('leaves English prose punctuation alone', () => {
    const s = 'Hello, world? Yes; fine.';
    expect(fix(s)).toBe(s);
  });

  it('tightens brackets and Persian quotes', () => {
    expect(fix('او گفت « سلام » و رفت')).toBe('او گفت «سلام» و رفت');
  });
});

describe('digits', () => {
  it('leaves digits alone by default', () => {
    expect(DEFAULT_FIX_OPTIONS.digits).toBe('keep');
    expect(fix('در سال 1402 حدود 250 نفر')).toContain('1402');
  });

  it('converts to Persian digits on request', () => {
    expect(fix('سال 1402', { digits: 'fa' })).toContain('۱۴۰۲');
  });

  it('converts Arabic-Indic digits to Persian', () => {
    expect(fix('قیمت ٥٠٠٠', { digits: 'fa' })).toContain('۵۰۰۰');
  });

  it('converts back to ASCII on request', () => {
    expect(fix('سال ۱۴۰۲', { digits: 'en' })).toContain('1402');
  });
});

describe('protected spans — the rule that matters most', () => {
  it('never touches fenced code', () => {
    const src = 'متن فارسی\n\n```js\nconst كتاب = "يك";\nlet x = 1 ;\n```';
    const out = fix(src);
    expect(out).toContain('const كتاب = "يك";');
    expect(out).toContain('let x = 1 ;');
  });

  it('never touches inline code', () => {
    expect(fix('دستور `git commit -m "يك"` را بزن')).toContain('`git commit -m "يك"`');
  });

  it('never touches a URL', () => {
    const url = 'https://example.com/يك/كتاب?a=1';
    expect(fix(`آدرس ${url} را ببین`)).toContain(url);
  });

  it('never touches a Windows path', () => {
    const p = 'C:\\Users\\Ali\\كتاب ها\\file.md';
    expect(fix(`مسیر ${p} است`)).toContain(p);
  });

  it('never touches a markdown link target', () => {
    expect(fix('[مستندات](https://example.com/يك)')).toContain('(https://example.com/يك)');
  });

  it('never touches an e-mail address', () => {
    expect(fix('به ali.يك@example.com بنویس')).toContain('ali.يك@example.com');
  });

  it('never touches math', () => {
    expect(fix('فرمول $x = يك$ است')).toContain('$x = يك$');
  });

  it('fixes the prose around a protected span', () => {
    const out = fix('كتاب ها را با `git add` اضافه كن');
    expect(out).toContain(`کتاب${Z}ها`);
    expect(out).toContain('`git add`');
    expect(out).toContain('کن');
  });
});

describe('whitespace', () => {
  it('collapses runs of spaces', () => {
    expect(fix('یک    دو')).toBe('یک دو');
  });

  it('strips trailing spaces', () => {
    expect(fix('متن   \nخط دوم')).toBe('متن\nخط دوم');
  });

  it('preserves a paragraph break', () => {
    expect(fix('یک\n\nدو')).toBe('یک\n\nدو');
  });
});

describe('reporting', () => {
  it('counts nothing for already-correct text', () => {
    expect(fixPersianText('این متن درست است').total).toBe(0);
  });

  it('reports which rules fired', () => {
    const r = fixPersianText('اين كتاب ها را می خوانم ، خوب است');
    expect(Object.keys(r.counts)).toEqual(expect.arrayContaining(['letters', 'zwnj']));
    expect(r.total).toBeGreaterThan(0);
  });

  it('is idempotent — running twice changes nothing further', () => {
    const once = fix('اين كتاب ها را می خواهم ، خوب است');
    expect(fix(once)).toBe(once);
  });

  it('every rule can be switched off', () => {
    const src = 'اين كتاب ها';
    const out = fixPersianText(src, {
      normaliseLetters: false,
      fixZwnj: false,
      fixPunctuationSpacing: false,
      normalisePunctuation: false,
      tidyWhitespace: false,
    }).text;
    expect(out).toBe(src);
  });
});

describe('language detection', () => {
  it('recognises Persian text', () => {
    expect(isPersianText('این یک متن فارسی است')).toBe(true);
  });

  it('rejects English text', () => {
    expect(isPersianText('This is English text')).toBe(false);
  });

  it('treats a Persian sentence with an English term as Persian', () => {
    expect(isPersianText('من از Visual Studio Code استفاده می‌کنم')).toBe(true);
  });
});

/**
 * Spell-check node selection.
 *
 * The checker is only useful if it stays out of code. This pins the DOM-side
 * filter; `words.ts` already covers the source-text side.
 */
describe('spell highlighting — which text gets checked', () => {
  it('skips code, formulas and diagrams, keeps prose', async () => {
    const { __testing } = await import('../src/components/spell-highlight');
    const root = document.createElement('div');
    root.innerHTML = `
      <p>یک متن فارسی</p>
      <p>Some English prose here</p>
      <pre><code>const misspeled = 1;</code></pre>
      <p>inline <code>getElementByy</code> call</p>
      <p class="math">\\alpha</p>
      <div class="diagram">graph TD</div>
      <p><kbd>Ctrl</kbd></p>`;

    const texts = __testing
      .textNodes(root)
      .map((n) => n.nodeValue!.trim())
      .filter(Boolean);

    expect(texts).toContain('یک متن فارسی');
    expect(texts).toContain('Some English prose here');
    expect(texts.some((x) => x.includes('misspeled'))).toBe(false);
    expect(texts.some((x) => x.includes('getElementByy'))).toBe(false);
    expect(texts.some((x) => x.includes('alpha'))).toBe(false);
    expect(texts.some((x) => x.includes('graph TD'))).toBe(false);
    expect(texts).toContain('call');
  });

  it('ignores whitespace-only and one-character nodes', async () => {
    const { __testing } = await import('../src/components/spell-highlight');
    const root = document.createElement('div');
    root.innerHTML = '<p>  </p><p>x</p><p>real words</p>';
    const texts = __testing.textNodes(root).map((n) => n.nodeValue);
    expect(texts).toEqual(['real words']);
  });
});

/**
 * The suggestion menu needs to know which word a click landed in, and where it
 * starts and ends so a chosen suggestion can replace it.
 */
describe('wordAtOffset — the word under the caret', () => {
  const at = (text: string, offset: number) => wordAtOffset(text, offset);

  it('finds the word around a caret', () => {
    const text = 'سلام دنیا';
    expect(at(text, 0)).toEqual({ word: 'سلام', start: 0, end: 4 });
    expect(at(text, 3)).toEqual({ word: 'سلام', start: 0, end: 4 });
    expect(at(text, 5)).toEqual({ word: 'دنیا', start: 5, end: 9 });
  });

  it('treats ZWNJ as part of the word, not a boundary', () => {
    const text = 'می‌خواهم';
    // می + ZWNJ + خواهم is eight code units; the ZWNJ must not split it.
    expect(at(text, 5)).toEqual({ word: 'می‌خواهم', start: 0, end: 8 });
  });

  it('returns null on whitespace, punctuation and out of range', () => {
    const text = 'سلام دنیا';
    expect(at(text, 4)).toBeNull();
    expect(at('یک، دو', 3)).toBeNull();
    expect(at(text, -1)).toBeNull();
    expect(at(text, 99)).toBeNull();
  });

  it('gives bounds that splice back out cleanly', () => {
    const text = 'the quik brown fox';
    const hit = at(text, 5)!;
    expect(hit.word).toBe('quik');
    expect(text.slice(0, hit.start) + 'quick' + text.slice(hit.end)).toBe('the quick brown fox');
  });
});
