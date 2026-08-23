/**
 * Host abstraction.
 *
 * The point of these tests is that the browser host degrades *honestly*. A
 * capability that does not exist must report that it does not exist, so the
 * UI can disable or explain rather than showing a button that quietly does
 * nothing.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  hasMarkdownExtension,
  baseName,
  dirName,
  formatBytes,
  describeHostError,
  MARKDOWN_EXTS,
} from '../src/platform/host';
import { BrowserHost } from '../src/platform/browser-host';
import { isTauri, getHost, initHost } from '../src/platform';

describe('path helpers', () => {
  it('accepts every documented Markdown extension, case-insensitively', () => {
    for (const ext of MARKDOWN_EXTS) {
      expect(hasMarkdownExtension(`notes.${ext}`)).toBe(true);
      expect(hasMarkdownExtension(`notes.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it('rejects anything else, including look-alikes', () => {
    for (const name of ['a.txt', 'a.mdx', 'a.exe', 'a.md.exe', 'noextension', 'a.html']) {
      expect(hasMarkdownExtension(name), name).toBe(false);
    }
  });

  it('extracts the base name from Windows and POSIX paths', () => {
    expect(baseName('C:\\Users\\Ali\\Documents\\یادداشت.md')).toBe('یادداشت.md');
    expect(baseName('/home/ali/notes/note.md')).toBe('note.md');
    expect(baseName('note.md')).toBe('note.md');
  });

  it('extracts the directory from a Windows path', () => {
    expect(dirName('C:\\Users\\Ali\\note.md')).toBe('C:\\Users\\Ali');
  });

  it('handles a path containing spaces', () => {
    expect(baseName('C:\\Program Files\\B mark\\read me.md')).toBe('read me.md');
  });
});

describe('byte formatting', () => {
  it('scales through B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('host error mapping', () => {
  it('maps the size cap to a translated key with a readable size', () => {
    const out = describeHostError('file_too_large:35651584');
    expect(out.key).toBe('toast.fileTooLarge');
    expect(out.vars.size).toBe('34.0 MB');
  });

  it('maps an unsupported extension to the file name only', () => {
    const out = describeHostError('unsupported_extension:C:\\tmp\\x.exe');
    expect(out.key).toBe('toast.unsupportedFile');
    expect(out.vars.name).toBe('x.exe');
  });

  it('falls back to a generic read failure for anything unrecognised', () => {
    for (const input of ['read_failed:EACCES', 'kaboom', '', null, undefined]) {
      expect(describeHostError(input).key).toBe('toast.readFailed');
    }
  });

  it('never leaks a raw Rust error string to the user', () => {
    const out = describeHostError('metadata_failed:Os { code: 5, kind: PermissionDenied }');
    expect(out.key).toBe('toast.readFailed');
    expect(JSON.stringify(out)).not.toContain('PermissionDenied');
  });
});

describe('host selection', () => {
  it('reports a browser when Tauri is absent', () => {
    expect(isTauri()).toBe(false);
    expect(getHost().kind).toBe('browser');
  });

  it('initHost returns the browser host outside Tauri', async () => {
    const host = await initHost();
    expect(host.kind).toBe('browser');
  });
});

describe('BrowserHost — honest degradation', () => {
  let host: BrowserHost;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    host = new BrowserHost();
  });

  it('declares that it cannot save', () => {
    expect(host.canSave).toBe(false);
  });

  it('rejects writeFile rather than pretending to succeed', async () => {
    await expect(host.writeFile()).rejects.toThrow('save_unavailable_in_browser');
  });

  it('rejects revealInFolder rather than silently doing nothing', async () => {
    await expect(host.revealInFolder()).rejects.toThrow('reveal_unavailable_in_browser');
  });

  it('treats watching as an explicit no-op, not an error', async () => {
    await expect(host.watch()).resolves.toBeUndefined();
    await expect(host.unwatchAll()).resolves.toBeUndefined();
  });

  it('opens external links in a new tab with noopener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await host.openExternal('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('round-trips settings through localStorage', async () => {
    await host.saveSettings('{"theme":"dark"}');
    expect(await host.loadSettings()).toBe('{"theme":"dark"}');
  });

  it('returns null when nothing is stored', async () => {
    expect(await host.loadSettings()).toBeNull();
  });

  it('refuses to read a path it was never handed', async () => {
    await expect(host.readFile('C:\\secrets\\passwords.md')).rejects.toThrow('not_a_file');
  });
});

describe('regression — Windows drive letters contain a colon', () => {
  it('does not truncate a Windows path at the drive letter', () => {
    // `message.split(':', 2)` would return a detail of just "C".
    const out = describeHostError('unsupported_extension:C:\\Users\\Ali\\notes\\x.exe');
    expect(out.vars.name).toBe('x.exe');
  });

  it('handles a UNC path', () => {
    const out = describeHostError('unsupported_extension:\\\\server\\share\\doc.rtf');
    expect(out.vars.name).toBe('doc.rtf');
  });

  it('handles a reason with no detail at all', () => {
    expect(describeHostError('file_too_large').key).toBe('toast.fileTooLarge');
  });
});
