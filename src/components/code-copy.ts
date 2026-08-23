/**
 * Copy-to-clipboard button on every fenced code block.
 *
 * Small feature, disproportionate value in a viewer whose main audience is
 * developers reading install instructions. The button copies the raw text of
 * the block, not the highlighted markup, and it is injected after rendering so
 * it never becomes part of what gets exported or searched.
 */

import { icon, ICONS } from './icons';
import { t } from '../i18n';

const RESET_AFTER = 1600;

export function attachCodeCopyButtons(content: HTMLElement): void {
  for (const block of Array.from(content.querySelectorAll<HTMLElement>('.code-block'))) {
    if (block.querySelector('.code-copy')) continue;

    const button = document.createElement('button');
    button.className = 'code-copy';
    button.type = 'button';
    button.title = t('code.copy');
    button.setAttribute('aria-label', t('code.copy'));
    button.innerHTML = icon(ICONS.copy, 13);

    button.addEventListener('click', () => {
      const code = block.querySelector('code');
      const text = code?.textContent ?? '';
      void copy(text).then((ok) => {
        button.classList.toggle('code-copy--done', ok);
        button.classList.toggle('code-copy--failed', !ok);
        button.title = ok ? t('code.copied') : t('code.copyFailed');
        window.setTimeout(() => {
          button.classList.remove('code-copy--done', 'code-copy--failed');
          button.title = t('code.copy');
        }, RESET_AFTER);
      });
    });

    block.appendChild(button);
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access can be refused; fall back to the old selection trick
    // rather than silently doing nothing.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
