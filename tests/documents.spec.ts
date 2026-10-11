import { describe, expect, it, beforeEach } from 'vitest';
import { DocumentSet } from '../src/components/documents';

const file = (name: string, content = '# x') => ({ path: `C:\\docs\\${name}`, name, content });

let set: DocumentSet;
beforeEach(() => {
  localStorage.clear();
  set = new DocumentSet();
});

describe('opening', () => {
  it('opens a file and makes it active', () => {
    const tab = set.open(file('a.md'));
    expect(set.count).toBe(1);
    expect(set.active).toBe(tab);
  });

  it('focuses an already-open file instead of duplicating it', () => {
    const first = set.open(file('a.md'));
    set.open(file('b.md'));
    const again = set.open(file('a.md'));
    expect(set.count).toBe(2);
    expect(again.id).toBe(first.id);
    expect(set.active?.id).toBe(first.id);
  });

  it('refreshes a clean tab when it is re-opened', () => {
    set.open(file('a.md', 'old'));
    set.open(file('a.md', 'new'));
    expect(set.active?.source).toBe('new');
  });

  it('does NOT overwrite a dirty buffer when the file is re-opened', () => {
    const tab = set.open(file('a.md', 'on disk'));
    tab.source = 'my unsaved edits';
    set.open(file('a.md', 'on disk, changed'));
    expect(set.active?.source).toBe('my unsaved edits');
  });

  it('resolves the direction of the tab label from the file name', () => {
    expect(set.open(file('گزارش.md')).dir).toBe('rtl');
    expect(set.open(file('report.md')).dir).toBe('ltr');
  });
});

describe('dirty tracking', () => {
  it('is clean immediately after opening', () => {
    const tab = set.open(file('a.md'));
    expect(set.isDirty(tab)).toBe(false);
    expect(set.anyDirty).toBe(false);
  });

  it('becomes dirty when the buffer diverges from disk', () => {
    const tab = set.open(file('a.md', 'x'));
    tab.source = 'y';
    expect(set.isDirty(tab)).toBe(true);
    expect(set.anyDirty).toBe(true);
  });

  it('is clean again when the buffer matches disk', () => {
    const tab = set.open(file('a.md', 'x'));
    tab.source = 'y';
    tab.saved = 'y';
    expect(set.isDirty(tab)).toBe(false);
  });
});

describe('closing', () => {
  it('focuses the tab to the right, as browsers do', () => {
    set.open(file('a.md'));
    const b = set.open(file('b.md'));
    const c = set.open(file('c.md'));
    set.activate(b.id);
    set.close(b.id);
    expect(set.active?.id).toBe(c.id);
  });

  it('falls back to the left when closing the last tab', () => {
    const a = set.open(file('a.md'));
    const b = set.open(file('b.md'));
    set.activate(b.id);
    set.close(b.id);
    expect(set.active?.id).toBe(a.id);
  });

  it('leaves no active tab when the last one closes', () => {
    const a = set.open(file('a.md'));
    set.close(a.id);
    expect(set.count).toBe(0);
    expect(set.active).toBeNull();
  });

  it('closing an inactive tab does not change the focus', () => {
    const a = set.open(file('a.md'));
    const b = set.open(file('b.md'));
    set.activate(a.id);
    set.close(b.id);
    expect(set.active?.id).toBe(a.id);
  });

  it('closeOthers keeps exactly one', () => {
    set.open(file('a.md'));
    const b = set.open(file('b.md'));
    set.open(file('c.md'));
    set.closeOthers(b.id);
    expect(set.count).toBe(1);
    expect(set.active?.id).toBe(b.id);
  });

  it('closeAll empties the set', () => {
    set.open(file('a.md'));
    set.open(file('b.md'));
    set.closeAll();
    expect(set.count).toBe(0);
    expect(set.active).toBeNull();
  });
});

describe('navigation', () => {
  it('cycles forward and wraps', () => {
    const a = set.open(file('a.md'));
    set.open(file('b.md'));
    const c = set.open(file('c.md'));
    set.activate(c.id);
    expect(set.cycle(1)?.id).toBe(a.id);
  });

  it('cycles backward and wraps', () => {
    const a = set.open(file('a.md'));
    set.open(file('b.md'));
    const c = set.open(file('c.md'));
    set.activate(a.id);
    expect(set.cycle(-1)?.id).toBe(c.id);
  });

  it('does nothing with a single tab', () => {
    const a = set.open(file('a.md'));
    expect(set.cycle(1)?.id).toBe(a.id);
  });

  it('Ctrl+1..8 selects by position', () => {
    set.open(file('a.md'));
    const b = set.open(file('b.md'));
    expect(set.activateByIndex(2)?.id).toBe(b.id);
  });

  it('Ctrl+9 selects the last tab, as browsers do', () => {
    set.open(file('a.md'));
    set.open(file('b.md'));
    const c = set.open(file('c.md'));
    expect(set.activateByIndex(9)?.id).toBe(c.id);
  });

  it('an out-of-range index does nothing', () => {
    set.open(file('a.md'));
    expect(set.activateByIndex(5)).toBeNull();
  });
});

describe('session', () => {
  it('stores paths, never document contents', () => {
    set.open({ path: 'C:\\docs\\secret.md', name: 'secret.md', content: 'CONFIDENTIAL BODY' });
    set.saveSession();
    const raw = localStorage.getItem('b-mark.session')!;
    expect(raw).toContain('secret.md');
    // Duplicating the user's files into browser storage would be both wasteful
    // and a privacy surprise.
    expect(raw).not.toContain('CONFIDENTIAL BODY');
  });

  it('round-trips the open paths and the active one', () => {
    set.open(file('a.md'));
    const b = set.open(file('b.md'));
    set.activate(b.id);
    set.saveSession();

    const restored = DocumentSet.readSession();
    expect(restored.paths).toEqual(['C:\\docs\\a.md', 'C:\\docs\\b.md']);
    expect(restored.active).toBe('C:\\docs\\b.md');
  });

  it('excludes the bundled sample, which is not a file on disk', () => {
    set.open({ path: 'tests/fixtures/stress.md', name: 'stress.md', content: 'x' });
    set.saveSession();
    expect(DocumentSet.readSession().paths).toEqual([]);
  });

  it('returns an empty session when nothing is stored', () => {
    expect(DocumentSet.readSession()).toEqual({ paths: [], active: null });
  });

  it('survives a corrupt session entry', () => {
    localStorage.setItem('b-mark.session', '{ not json');
    expect(DocumentSet.readSession()).toEqual({ paths: [], active: null });
  });

  it('survives a session entry of the wrong shape', () => {
    localStorage.setItem('b-mark.session', '"a string"');
    expect(DocumentSet.readSession()).toEqual({ paths: [], active: null });
    localStorage.setItem('b-mark.session', '{"paths":"nope"}');
    expect(DocumentSet.readSession().paths).toEqual([]);
  });

  it('clearSession empties it', () => {
    set.open(file('a.md'));
    set.saveSession();
    DocumentSet.clearSession();
    expect(DocumentSet.readSession().paths).toEqual([]);
  });
});

/**
 * Session persistence respects the setting.
 *
 * Turning session restore off has to erase what was already recorded. Leaving
 * the list behind means the app still holds a note of what you were reading
 * after you asked it to stop.
 */
describe('session — honouring the setting', () => {
  beforeEach(() => localStorage.clear());

  it('records paths when enabled', () => {
    set.open(file('a.md'));
    set.saveSession(true);
    expect(DocumentSet.readSession().paths).toEqual(['C:\\docs\\a.md']);
  });

  it('records nothing and erases an old record when disabled', () => {
    set.open(file('a.md'));
    set.saveSession(true);
    expect(DocumentSet.readSession().paths).toHaveLength(1);

    set.saveSession(false);
    expect(DocumentSet.readSession().paths).toEqual([]);
    expect(localStorage.getItem('b-mark.session')).toBeNull();
  });
});
