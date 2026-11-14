/**
 * Regression: double-clicking a .md file opened the window but not the file.
 *
 * Rust emitted `b-mark://open-files` inside `setup`, before the webview had
 * registered a listener, so the event was dropped. Launch files are now parked
 * in managed state and collected by the frontend via `take_launch_files`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserHost } from '../src/platform/browser-host';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('launch files', () => {
  it('the browser host has none', async () => {
    expect(await new BrowserHost().takeLaunchFiles()).toEqual([]);
  });

  it('Rust parks launch files instead of emitting them from setup', () => {
    const rs = read('src-tauri/src/main.rs');
    expect(rs).toContain('fn take_launch_files');
    expect(rs).toMatch(/generate_handler!\[[^\]]*take_launch_files/s);
    const setup = rs.slice(rs.indexOf('.setup('));
    expect(setup).not.toContain('emit(');
  });

  it('the Tauri host invokes the matching command', () => {
    expect(read('src/platform/tauri-host.ts')).toContain("'take_launch_files'");
  });

  it('boot collects launch files after the listeners are bound', () => {
    const ts = read('src/main.ts');
    expect(ts.indexOf('host.onOpenRequest')).toBeGreaterThan(-1);
    expect(ts.indexOf('takeLaunchFiles')).toBeGreaterThan(ts.indexOf('host.onOpenRequest'));
  });
});
