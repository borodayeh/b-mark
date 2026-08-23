/**
 * Split editor.
 *
 * A plain <textarea>, deliberately. A code-editor component (CodeMirror,
 * Monaco) would add 300 KB–2 MB to a bundle that is currently 340 KB, and
 * more importantly neither of them handles mixed Persian/English editing
 * better than the browser's own native text control does — the platform's
 * bidi caret handling, IME, spell-check and selection are exactly what a
 * Persian writer already expects from every other text field in Windows.
 *
 * The textarea carries `dir="auto"` rather than our per-block engine: while
 * you are *typing* you want the caret to follow the paragraph you are in, and
 * the source pane shows Markdown syntax, not prose. The preview pane beside it
 * is where the real direction engine runs.
 */

import { t } from '../i18n';

export interface EditorCallbacks {
  onInput: (value: string) => void;
  onSaveRequest: () => void;
}

export class SplitEditor {
  private textarea: HTMLTextAreaElement | null = null;
  private wrap: HTMLElement | null = null;
  private callbacks: EditorCallbacks;
  /** Guards against the preview's scroll handler bouncing back into ours. */
  private syncing = false;

  constructor(callbacks: EditorCallbacks) {
    this.callbacks = callbacks;
  }

  get element(): HTMLElement | null {
    return this.wrap;
  }

  get value(): string {
    return this.textarea?.value ?? '';
  }

  set value(next: string) {
    if (this.textarea && this.textarea.value !== next) {
      this.textarea.value = next;
    }
  }

  mount(container: HTMLElement, initial: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'editor';

    const textarea = document.createElement('textarea');
    textarea.className = 'editor__input';
    textarea.spellcheck = false;
    textarea.value = initial;
    // See the module comment: `auto` is right for a source pane.
    textarea.setAttribute('dir', 'auto');
    textarea.setAttribute('aria-label', t('editor.sourceLabel'));

    wrap.appendChild(textarea);
    container.appendChild(wrap);

    this.wrap = wrap;
    this.textarea = textarea;

    textarea.addEventListener('input', () => this.callbacks.onInput(textarea.value));

    textarea.addEventListener('keydown', (e) => {
      // Ctrl+S saves. Everything else falls through to the global handler.
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.callbacks.onSaveRequest();
        return;
      }
      // Tab inserts a tab instead of leaving the field — in a code-adjacent
      // editor that is what people expect, and Escape still frees the focus
      // for keyboard users so this does not become a focus trap.
      if (e.key === 'Tab') {
        e.preventDefault();
        this.insert('\t');
      }
    });

    return wrap;
  }

  unmount(): void {
    this.wrap?.remove();
    this.wrap = null;
    this.textarea = null;
  }

  focus(): void {
    this.textarea?.focus();
  }

  /** Insert text at the caret, keeping undo history intact where possible. */
  private insert(text: string): void {
    const ta = this.textarea;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;

    // `execCommand` is deprecated but is still the only way to write into a
    // textarea without destroying the native undo stack, so try it first.
    // It is absent in jsdom and browsers may eventually drop it, hence the
    // feature test rather than a bare call.
    let inserted = false;
    if (typeof document.execCommand === 'function') {
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {
        inserted = false;
      }
    }

    if (!inserted) {
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + text.length;
    }

    this.callbacks.onInput(ta.value);
  }

  /**
   * Proportional scroll sync from the source pane to the preview.
   *
   * Line-accurate sync would need source maps from markdown-it through
   * sanitisation and back out to the DOM. Proportional is honest about being
   * an approximation and never lands somewhere absurd.
   */
  bindScrollSync(preview: HTMLElement): void {
    const ta = this.textarea;
    if (!ta) return;

    ta.addEventListener('scroll', () => {
      if (this.syncing) return;
      this.syncing = true;

      const srcMax = ta.scrollHeight - ta.clientHeight;
      const dstMax = preview.scrollHeight - preview.clientHeight;
      if (srcMax > 0 && dstMax > 0) {
        preview.scrollTop = (ta.scrollTop / srcMax) * dstMax;
      }

      requestAnimationFrame(() => {
        this.syncing = false;
      });
    });
  }
}
