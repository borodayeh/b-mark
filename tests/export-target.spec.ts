/**
 * Where an export actually goes.
 *
 * The original implementation created a blob URL and clicked an `<a download>`.
 * That is correct in a browser and a no-op in WebView2, which has no download
 * manager behind an anchor: the click was silently dropped and the app still
 * announced "exported document.docx". These tests pin the replacement — the
 * bytes go through the host, and a cancelled save dialog is reported as a
 * cancellation, not as success.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getHost } from '../src/platform';
import { exportHtml } from '../src/components/export';
import { exportDocx } from '../src/components/docx-export';
import type { ExportFile } from '../src/platform/host';

function documentBody(html: string): HTMLElement {
  const article = document.createElement('article');
  article.className = 'content';
  article.innerHTML = html;
  document.body.appendChild(article);
  return article;
}

let saved: ExportFile[];

beforeEach(() => {
  document.body.innerHTML = '';
  saved = [];
  vi.spyOn(getHost(), 'saveExport').mockImplementation(async (file: ExportFile) => {
    saved.push(file);
    return file.name;
  });
});

describe('HTML export', () => {
  it('hands the bytes to the host rather than clicking an anchor', async () => {
    const name = await exportHtml({ title: 'notes.md', content: documentBody('<p>سلام</p>') });

    expect(name).toBe('notes.html');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.extensions).toEqual(['html']);
    expect(ArrayBuffer.isView(saved[0]!.bytes)).toBe(true);
    expect(saved[0]!.bytes.byteLength).toBeGreaterThan(1000);

    // Round-trips as UTF-8: Persian must survive the encode.
    const text = new TextDecoder().decode(saved[0]!.bytes);
    expect(text).toContain('سلام');
    expect(text.startsWith('<!doctype html>')).toBe(true);
  });

  it('reports a cancelled save dialog as null, not as a written file', async () => {
    vi.spyOn(getHost(), 'saveExport').mockResolvedValue(null);
    const name = await exportHtml({ title: 'notes.md', content: documentBody('<p>x</p>') });
    expect(name).toBeNull();
  });

  it('drops the source extension instead of producing notes.md.html', async () => {
    await exportHtml({ title: 'notes.markdown', content: documentBody('<p>x</p>') });
    expect(saved[0]!.name).toBe('notes.html');
  });
});

describe('DOCX export', () => {
  it('hands a real .docx package to the host', async () => {
    const name = await exportDocx({
      title: 'گزارش.md',
      content: documentBody('<h1>عنوان</h1><p>متن فارسی</p>'),
    });

    expect(name).toBe('گزارش.docx');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.extensions).toEqual(['docx']);

    // A .docx is a zip: the local file header magic must be there, otherwise
    // Word refuses the file with no useful message.
    const head = saved[0]!.bytes.subarray(0, 4);
    expect(Array.from(head)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(saved[0]!.bytes.byteLength).toBeGreaterThan(2000);
  });

  it('uses the Word MIME type so the browser fallback names it correctly', async () => {
    await exportDocx({ title: 'x.md', content: documentBody('<p>hello</p>') });
    expect(saved[0]!.mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('reports a cancelled save dialog as null', async () => {
    vi.spyOn(getHost(), 'saveExport').mockResolvedValue(null);
    const name = await exportDocx({ title: 'x.md', content: documentBody('<p>hello</p>') });
    expect(name).toBeNull();
  });
});
