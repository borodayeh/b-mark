import { describe, expect, it } from 'vitest';
import {
  detectDirection,
  scoreDirection,
  stripDirectionNoise,
  isStrongRtl,
  isStrongLtr,
} from '../src/direction/unicode';

describe('strong-character classification', () => {
  it('classifies Persian-specific letters as strong RTL', () => {
    for (const ch of 'یکگچپژآاءهضصثقفغعخحجدشسبلتنمئوطزرذ') {
      expect(isStrongRtl(ch.codePointAt(0)!), ch).toBe(true);
    }
  });

  it('classifies Hebrew and Arabic presentation forms as strong RTL', () => {
    expect(isStrongRtl('ש'.codePointAt(0)!)).toBe(true); // U+05E9
    expect(isStrongRtl(0xfefb)).toBe(true); // Arabic ligature LAM WITH ALEF
  });

  it('classifies Latin, Greek and Cyrillic as strong LTR', () => {
    expect(isStrongLtr('A'.codePointAt(0)!)).toBe(true);
    expect(isStrongLtr('ü'.codePointAt(0)!)).toBe(true);
    expect(isStrongLtr('π'.codePointAt(0)!)).toBe(true);
    expect(isStrongLtr('д'.codePointAt(0)!)).toBe(true);
  });

  it('treats digits, ZWNJ, punctuation and emoji as neutral', () => {
    for (const cp of [
      0x0030, // 0
      0x0669, // ٩ Arabic-Indic digit — neutral by the Bidi algorithm, not strong
      0x06f9, // ۹ Extended Arabic-Indic digit
      0x200c, // ZWNJ (نیم‌فاصله)
      0x0020,
      0x002e, // .
      0x00ab, // «
    ]) {
      expect(isStrongRtl(cp), `rtl ${cp.toString(16)}`).toBe(false);
      expect(isStrongLtr(cp), `ltr ${cp.toString(16)}`).toBe(false);
    }
    expect(isStrongRtl(0x1f600)).toBe(false);
    expect(isStrongLtr(0x1f600)).toBe(false);
  });
});

describe('noise stripping', () => {
  it('removes inline code, fenced code, URLs, paths and link targets', () => {
    const cases: Array<[string, RegExp]> = [
      ['متن `const answer = 42` ادامه', /const|answer/],
      ['```js\nconsole.log("hello world")\n```', /console|hello/],
      ['ببینید https://github.com/marktext/marktext را', /github|marktext/],
      ['مسیر C:\\Users\\Ali\\Documents\\note.md است', /Users|Documents/],
      ['فایل ./docs/readme.md را باز کنید', /docs|readme/],
      ['[مستندات](https://example.com/very/long/path)', /example|path/],
      ['به ali.rezaei@example.com ایمیل بزنید', /rezaei|example/],
    ];
    for (const [input, forbidden] of cases) {
      expect(stripDirectionNoise(input), input).not.toMatch(forbidden);
    }
  });

  it('keeps the Persian prose intact', () => {
    const out = stripDirectionNoise('دستور `npm install` را اجرا کنید');
    expect(out).toContain('دستور');
    expect(out).toContain('اجرا کنید');
  });
});

describe('detectDirection — the cases dir="auto" gets wrong', () => {
  it('a Persian sentence STARTING with code is still RTL', () => {
    // dir="auto" would see `n` of npm first and render this LTR.
    expect(detectDirection('`npm install` را در ترمینال اجرا کنید.')).toBe('rtl');
  });

  it('a Persian sentence starting with a URL is still RTL', () => {
    expect(detectDirection('https://github.com را باز کنید و مخزن را فورک کنید.')).toBe('rtl');
  });

  it('a Persian sentence starting with an English product name is still RTL', () => {
    expect(detectDirection('Visual Studio Code یکی از بهترین ویرایشگرهای متن است.')).toBe('rtl');
  });

  it('an English sentence quoting a Persian word is still LTR', () => {
    expect(detectDirection('The Persian word for hello is سلام, which is common.')).toBe('ltr');
  });
});

describe('detectDirection — core behaviour', () => {
  it('pure Persian is RTL', () => {
    expect(detectDirection('این یک پاراگراف کاملاً فارسی است.')).toBe('rtl');
  });

  it('pure English is LTR', () => {
    expect(detectDirection('This is an entirely English paragraph.')).toBe('ltr');
  });

  it('pure Arabic is RTL', () => {
    expect(detectDirection('هذه فقرة باللغة العربية بالكامل.')).toBe('rtl');
  });

  it('pure Hebrew is RTL', () => {
    expect(detectDirection('זהו משפט בעברית.')).toBe('rtl');
  });

  it('inherits for a digits-only block', () => {
    expect(detectDirection('۱۲۳۴۵ ۶۷۸', 'rtl')).toBe('rtl');
    expect(detectDirection('12345 678', 'ltr')).toBe('ltr');
  });

  it('inherits for an empty or punctuation-only block', () => {
    expect(detectDirection('', 'rtl')).toBe('rtl');
    expect(detectDirection('— … !!! ***', 'rtl')).toBe('rtl');
  });

  it('inherits for a code-only block instead of guessing LTR', () => {
    expect(detectDirection('`git status`', 'rtl')).toBe('rtl');
  });

  it('handles ZWNJ (نیم‌فاصله) without breaking the count', () => {
    expect(detectDirection('می‌خواهم برنامه‌نویسی یاد بگیرم.')).toBe('rtl');
  });

  it('handles Persian quotation marks and punctuation', () => {
    expect(detectDirection('او گفت: «سلام، حال شما چطور است؟»')).toBe('rtl');
  });
});

describe('detectDirection — explicit Unicode bidi controls win', () => {
  it('RLM forces RTL on otherwise-English text', () => {
    expect(detectDirection('\u200fmostly english words here')).toBe('rtl');
  });

  it('LRM forces LTR on otherwise-Persian text', () => {
    expect(detectDirection('\u200eمتن فارسی که باید چپ‌چین شود')).toBe('ltr');
  });

  it('RLI and LRI are honoured too', () => {
    expect(detectDirection('\u2067english text')).toBe('rtl');
    expect(detectDirection('\u2066متن فارسی')).toBe('ltr');
  });
});

describe('scoreDirection — threshold calibration', () => {
  it('reports the raw counts and ratio', () => {
    const s = scoreDirection('abc سلام');
    expect(s.ltr).toBe(3);
    expect(s.rtl).toBe(4);
    expect(s.ratio).toBeCloseTo(4 / 7, 5);
    expect(s.neutral).toBe(false);
  });

  it('marks a neutral block as neutral with ratio 0', () => {
    const s = scoreDirection('۱۲۳ 456 --- ***');
    expect(s.neutral).toBe(true);
    expect(s.ratio).toBe(0);
  });

  it('a heading that is 30% Persian tips to RTL', () => {
    // "API" (3 LTR) + "چیست" (4 RTL) => 4/7 = 0.57
    expect(detectDirection('API چیست')).toBe('rtl');
  });

  it('a heading with one trailing Persian particle in long English stays LTR', () => {
    const s = scoreDirection(
      'Installing and configuring the development environment on Windows و',
    );
    expect(s.ratio).toBeLessThan(0.3);
    expect(detectDirection('Installing and configuring the development environment on Windows و')).toBe('ltr');
  });
});
