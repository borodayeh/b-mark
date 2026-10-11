/**
 * Split editor.
 *
 * jsdom gives us a real <textarea> with real events, so most of the editor's
 * contract is genuinely testable here — including the bit that matters most
 * for this project: the source pane must not force a direction on the text
 * being edited.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SplitEditor } from '../src/editor/split-editor';

let container: HTMLElement;
let onInput: ReturnType<typeof vi.fn>;
let onSaveRequest: ReturnType<typeof vi.fn>;
let editor: SplitEditor;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  container = document.getElementById('host')!;
  onInput = vi.fn();
  onSaveRequest = vi.fn();
  editor = new SplitEditor({ onInput, onSaveRequest });
});

const textarea = () => container.querySelector<HTMLTextAreaElement>('.editor__input')!;

describe('mounting', () => {
  it('creates a textarea seeded with the document', () => {
    editor.mount(container, '# سلام');
    expect(textarea().value).toBe('# سلام');
  });

  it('uses dir="auto" on the source pane', () => {
    // The per-block engine runs on the *preview*. While typing, the caret
    // should follow the paragraph you are in, which is what auto gives.
    editor.mount(container, '');
    expect(textarea().getAttribute('dir')).toBe('auto');
  });

  it('disables spellcheck, which fights Persian and Markdown syntax alike', () => {
    editor.mount(container, '');
    expect(textarea().spellcheck).toBe(false);
  });

  it('labels the pane for screen readers', () => {
    editor.mount(container, '');
    expect(textarea().getAttribute('aria-label')).toBeTruthy();
  });

  it('unmount removes the pane and clears the reference', () => {
    editor.mount(container, 'x');
    editor.unmount();
    expect(container.querySelector('.editor')).toBeNull();
    expect(editor.element).toBeNull();
  });
});

describe('editing', () => {
  it('reports every input to the owner', () => {
    editor.mount(container, '');
    const ta = textarea();
    ta.value = 'متن جدید';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('متن جدید');
  });

  it('exposes the current value', () => {
    editor.mount(container, 'a');
    textarea().value = 'b';
    expect(editor.value).toBe('b');
  });

  it('setting value writes through to the textarea', () => {
    editor.mount(container, 'a');
    editor.value = 'ب';
    expect(textarea().value).toBe('ب');
  });

  it('does not disturb the textarea when the value is unchanged', () => {
    editor.mount(container, 'same');
    const ta = textarea();
    ta.setSelectionRange(2, 2);
    editor.value = 'same';
    // Re-assigning a textarea's value collapses the selection; skipping the
    // write is what keeps the caret still during a re-render.
    expect(ta.selectionStart).toBe(2);
  });

  it('preserves Persian text exactly, ZWNJ included', () => {
    const text = 'می‌خواهم برنامه‌نویسی یاد بگیرم';
    editor.mount(container, text);
    expect(textarea().value).toBe(text);
    expect(textarea().value).toContain('\u200c');
  });
});

describe('keyboard', () => {
  it('Ctrl+S asks the owner to save and suppresses the browser dialog', () => {
    editor.mount(container, '');
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    textarea().dispatchEvent(event);
    expect(onSaveRequest).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('Tab inserts a tab instead of leaving the field', () => {
    editor.mount(container, '');
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    textarea().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onInput).toHaveBeenCalled();
  });

  it('lets other shortcuts through to the global handler', () => {
    editor.mount(container, '');
    for (const key of ['o', 'r', '0', 'e']) {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true });
      textarea().dispatchEvent(event);
      expect(event.defaultPrevented, `Ctrl+${key}`).toBe(false);
    }
  });

  it('does not trap Escape, so keyboard users can leave the field', () => {
    editor.mount(container, '');
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    textarea().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('scroll sync', () => {
  it('maps the source position proportionally onto the preview', () => {
    editor.mount(container, 'x'.repeat(5000));
    const ta = textarea();
    const preview = document.createElement('div');
    document.body.appendChild(preview);

    // jsdom reports zero for every layout metric, so define them.
    const define = (node: Element, scrollHeight: number, clientHeight: number) => {
      Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
      Object.defineProperty(node, 'clientHeight', { value: clientHeight, configurable: true });
    };
    define(ta, 2000, 500);
    define(preview, 4000, 500);

    editor.bindScrollSync(preview);
    ta.scrollTop = 750; // halfway through 1500 px of travel
    ta.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBe(1750); // half of 3500 px of travel
  });

  it('does nothing when neither pane can scroll', () => {
    editor.mount(container, 'short');
    const ta = textarea();
    const preview = document.createElement('div');
    editor.bindScrollSync(preview);
    ta.dispatchEvent(new Event('scroll'));
    expect(preview.scrollTop).toBe(0);
  });
});

/**
 * Replacing a range is the primitive the spelling-suggestion menu uses: the
 * caret position in the editor and the buffer share one coordinate system,
 * which is the only reason a correction can be applied exactly. It goes through
 * the same `execCommand` path as Tab so the native undo stack survives.
 */
describe('replaceRange', () => {
  it('splices the chosen text over the original word', () => {
    const seen: string[] = [];
    const ed = new SplitEditor({ onInput: (v) => seen.push(v), onSaveRequest: () => undefined });
    ed.mount(container, 'the quik brown fox');
    ed.replaceRange(4, 8, 'quick');
    expect(textarea().value).toBe('the quick brown fox');
    // The change is reported so the preview and the dirty flag follow.
    expect(seen).toEqual(['the quick brown fox']);
  });

  it('leaves the caret after the inserted text', () => {
    const ed = new SplitEditor({ onInput: () => undefined, onSaveRequest: () => undefined });
    ed.mount(container, 'abc');
    ed.replaceRange(3, 3, 'def');
    expect(textarea().value).toBe('abcdef');
    expect(textarea().selectionStart).toBe(6);
    expect(textarea().selectionEnd).toBe(6);
  });
});
