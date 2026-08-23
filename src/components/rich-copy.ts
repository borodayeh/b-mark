/**
 * Copy the rendered document as rich text.
 *
 * The practical problem this solves: a Persian writer finishes a document in
 * Markdown and then has to hand it to someone who works in Word, Outlook or
 * Telegram. Copying the source pastes asterisks; copying from most viewers
 * pastes text that loses its direction and comes out left-aligned with the
 * punctuation on the wrong side.
 *
 * Writing `text/html` to the clipboard alongside `text/plain` makes Word,
 * Outlook, Google Docs and every other rich-text target paste formatted
 * content — and because the per-block `dir` attributes travel with it, a
 * Persian paragraph arrives right-aligned in Word without anyone touching a
 * paragraph setting.
 */

import { store } from '../settings/store';
import { FONT_STACKS } from '../settings/schema';

/**
 * Word and Outlook honour inline styles far more reliably than a `<style>`
 * block, and they ignore CSS custom properties entirely, so the values are
 * resolved and written onto the elements themselves.
 */
function inlineStyles(root: HTMLElement): void {
  const s = store.current;
  const contentFont = FONT_STACKS[s.contentFont];
  const codeFont = FONT_STACKS[s.codeFont];

  const set = (el: Element, css: string) => {
    const existing = el.getAttribute('style');
    el.setAttribute('style', existing ? `${existing};${css}` : css);
  };

  set(root, `font-family:${contentFont};font-size:${s.fontSize}px;line-height:${s.lineHeight};color:#1b1f24`);

  for (const h of Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    const level = Number(h.tagName[1]);
    const size = [1.9, 1.5, 1.25, 1.08, 1, 0.92][level - 1] ?? 1;
    set(h, `font-weight:700;font-size:${(size * s.fontSize).toFixed(0)}px;margin:1.4em 0 .6em`);
  }
  for (const p of Array.from(root.querySelectorAll('p, li'))) {
    set(p, `margin:0 0 ${s.paragraphSpacing}em`);
  }
  for (const code of Array.from(root.querySelectorAll('code'))) {
    set(code, `font-family:${codeFont};font-size:.9em;background:#f4f6f8;padding:.1em .3em;border-radius:3px;direction:ltr;unicode-bidi:isolate`);
  }
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    set(pre, `font-family:${codeFont};background:#f4f6f8;border:1px solid #e8ebef;border-radius:8px;padding:12px;overflow-x:auto;direction:ltr;text-align:left;white-space:pre-wrap`);
  }
  for (const q of Array.from(root.querySelectorAll('blockquote'))) {
    set(q, 'margin:0 0 1em;padding:.2em 1em;color:#59636e;border-inline-start:3px solid #d0d7de');
  }
  for (const table of Array.from(root.querySelectorAll('table'))) {
    set(table, 'border-collapse:collapse;width:100%');
  }
  for (const cell of Array.from(root.querySelectorAll('th,td'))) {
    set(cell, 'border:1px solid #d8dde3;padding:.45em .8em;vertical-align:top');
  }
  for (const th of Array.from(root.querySelectorAll('th'))) {
    set(th, 'background:#f6f7f9;font-weight:600');
  }
  for (const a of Array.from(root.querySelectorAll('a'))) {
    set(a, 'color:#0b5cd5;text-decoration:underline');
  }
  for (const img of Array.from(root.querySelectorAll('img'))) {
    set(img, 'max-width:100%;height:auto');
  }
  // Alignment must be written out: Word reads `dir` but many targets do not
  // derive text-align from it.
  for (const el of Array.from(root.querySelectorAll('[dir="rtl"]'))) {
    set(el, 'text-align:right');
  }
  for (const el of Array.from(root.querySelectorAll('[dir="ltr"]'))) {
    set(el, 'text-align:left');
  }
}

function prepare(content: HTMLElement): HTMLElement {
  const clone = content.cloneNode(true) as HTMLElement;

  // Restore real hrefs; inside the app they are inert.
  for (const a of Array.from(clone.querySelectorAll('a[data-external]'))) {
    a.setAttribute('href', a.getAttribute('data-external') ?? '#');
  }
  // A blocked remote image must not have its URL travel to the clipboard.
  for (const img of Array.from(clone.querySelectorAll<HTMLImageElement>('img[data-remote]'))) {
    if (!img.getAttribute('src')) {
      img.replaceWith(document.createTextNode(`[${img.getAttribute('alt') || 'image'}]`));
    }
  }
  for (const btn of Array.from(clone.querySelectorAll('.code-copy, .diagram__source'))) {
    btn.remove();
  }

  inlineStyles(clone);

  for (const node of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
    for (const attr of [
      'data-src',
      'data-remote',
      'data-external',
      'data-anchor',
      'data-relative',
      'data-relative-src',
      'data-bmark-dir',
      'data-latex',
      'data-typeset',
    ]) {
      node.removeAttribute(attr);
    }
  }

  return clone;
}

export interface RichCopyResult {
  html: boolean;
  plain: boolean;
}

/**
 * Put both flavours on the clipboard. A rich-text target takes the HTML; a
 * plain-text one takes the text, so nothing is lost either way.
 */
export async function copyAsRichText(content: HTMLElement): Promise<RichCopyResult> {
  const clone = prepare(content);
  const html = `<meta charset="utf-8">${clone.outerHTML}`;
  const plain = clone.innerText ?? clone.textContent ?? '';

  // The async Clipboard API is the only way to write two MIME types at once.
  try {
    if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return { html: true, plain: true };
    }
  } catch {
    /* fall through to the selection-based path */
  }

  // Fallback: select an off-screen copy and let the browser do the conversion.
  // Loses nothing except the guarantee of both flavours.
  try {
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;inset-inline-start:-10000px;top:0;white-space:pre-wrap';
    holder.appendChild(clone);
    document.body.appendChild(holder);

    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');

    selection?.removeAllRanges();
    holder.remove();
    return { html: ok, plain: ok };
  } catch {
    return { html: false, plain: false };
  }
}

/** Plain Markdown source to the clipboard — the other thing people want. */
export async function copyAsMarkdown(source: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(source);
    return true;
  } catch {
    return false;
  }
}
