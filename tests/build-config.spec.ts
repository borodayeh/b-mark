/**
 * Build-configuration invariants.
 *
 * These assert things about the repository's own build wiring rather than
 * about the application, because a mistake there is invisible until a binary
 * ships — and this project has already shipped one class of them.
 *
 * The concrete history: `.cargo/config.toml` pinned `+crt-static` so the
 * "portable" exe would not need the Visual C++ Redistributable. It sat in
 * `src-tauri/.cargo/`, which is where a Rust developer would put it. But
 * cargo discovers `.cargo/config.toml` by walking up from the directory it was
 * *invoked* from, never from the manifest's directory — so CI, which builds
 * with `cargo build --manifest-path src-tauri/Cargo.toml` from the repository
 * root, never read it. The flag silently did not apply. `verify-exe.py`
 * correctly failed the build on the resulting VCRUNTIME140.dll imports, and
 * that check has been failing for 25 consecutive runs, every one at the same
 * line, while the local cross-build — which cds into `src-tauri/` first —
 * passed the whole time. Nothing was ever published.
 *
 * So: the file must be at the root, where both invocation paths see it, and
 * nothing may reintroduce a copy next to the manifest.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('static CRT is configured where cargo will actually find it', () => {
  it('lives at the repository root, not next to the manifest', () => {
    expect(existsSync(resolve(root, '.cargo/config.toml'))).toBe(true);
    // The bug: a config inside src-tauri/ is invisible to a build invoked from
    // the repository root, which is how CI invokes cargo.
    expect(existsSync(resolve(root, 'src-tauri/.cargo/config.toml'))).toBe(false);
  });

  it('pins crt-static for both Windows targets', () => {
    const cfg = read('.cargo/config.toml');
    for (const target of [
      'x86_64-pc-windows-msvc',
      'aarch64-pc-windows-msvc',
    ]) {
      // Capture to the next `[section]` header, not to the next `[` — the
      // rustflags array itself contains one.
      const block = new RegExp(`\\[target\\.${target}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
      const match = block.exec(cfg);
      expect(match, `no [target.${target}] section`).not.toBeNull();
      expect(match![1]).toContain('+crt-static');
    }
  });

  it('is not shadowed by a second copy that would win instead', () => {
    // Cargo merges every .cargo/config.toml from the cwd upward, nearest first.
    // A copy in src-tauri/ would take precedence over the root one when cargo
    // runs from there, and would be ignored entirely from the root — so there
    // must be exactly one, and it must be the root one.
    const copies = ['.cargo/config.toml', 'src-tauri/.cargo/config.toml']
      .filter((p) => existsSync(resolve(root, p)));
    expect(copies).toEqual(['.cargo/config.toml']);
  });
});

describe('the installer reads an executable that exists', () => {
  it('resolves the portable exe by compile-time fallback, not one fixed name', () => {
    const nsi = read('installer/b-mark.nsi');
    // The workflow renames (and deletes) `B mark.exe` before makensis runs, and
    // NSIS resolves `File` paths at compile time. Hard-coding one name made the
    // installer depend on the order of CI's steps.
    expect(nsi).toMatch(/!if \/FileExists "\.\.\\release\\B mark\.exe"/);
    expect(nsi).toMatch(/!define SRCEXE "\.\.\\release\\B mark\.exe"/);
    expect(nsi).toMatch(/!define SRCEXE "\.\.\\release\\B mark \$\{VERSION\} Portable\.exe"/);
  });

  it('only packages files that are actually in the repository', () => {
    // makensis cds into installer/, so every relative path in a File directive
    // is relative to that directory. A path that does not exist there is a
    // compile error, not a warning.
    const nsi = read('installer/b-mark.nsi');
    const paths = [...nsi.matchAll(/^\s*File\s+"[^"]+"\s+"([^"]+)"/gm)]
      .map((m) => m[1]!)
      .filter((p) => !p.startsWith('/') && !p.startsWith('${'));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const resolved = resolve(root, 'installer', p.replace(/\\/g, '/'));
      expect(existsSync(resolved), `${p} does not resolve to ${resolved}`).toBe(true);
    }
  });
});

describe('the workflow invokes tools it can actually find', () => {
  it('braces ${env:ProgramFiles(x86)} when calling makensis', () => {
    // PowerShell expands $env:ProgramFiles and appends the literal "(x86)"
    // without the braces, producing "C:\Program Files(x86)" — no space, and a
    // path that does not exist. makensis was therefore never invoked, and the
    // installer step failed every single run for a compiler that was installed
    // one step earlier.
    const yml = read('.github/workflows/build-windows.yml');
    expect(yml).not.toMatch(/\$env:ProgramFiles\(x86\)/);
    expect(yml).toContain('${env:ProgramFiles(x86)}');
  });

  it('builds the installer before renaming the portable exe', () => {
    // NSIS resolves `File` paths at compile time, so a step that deletes the
    // exe first breaks the build.
    const steps = [
      ...read('.github/workflows/build-windows.yml').matchAll(/^\s*- name: (.+)$/gm),
    ].map((m) => m[1]!);
    const installer = steps.indexOf('Build per-user installer');
    const rename = steps.indexOf('Name the portable asset after its version');
    expect(installer).toBeGreaterThan(-1);
    expect(rename).toBeGreaterThan(-1);
    expect(installer).toBeLessThan(rename);
  });
});

describe('every version string agrees', () => {
  // The lockfiles had drifted to 0.1.0 and 0.1.2 while package.json said
  // 0.1.2. Nothing checks them, so nothing noticed. The release checklist says
  // "three places" and it is really five.
  const version = JSON.parse(read('package.json')).version as string;

  it('reads the same version everywhere a build stamps it', () => {
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const cargo = read('src-tauri/Cargo.toml');
    const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as { version: string };

    expect(lock.version).toBe(version);
    expect(lock.packages['']?.version).toBe(version);
    expect(cargo).toMatch(new RegExp(`^version = "${version.replace(/\./g, '\\.')}"$`, 'm'));
    expect(conf.version).toBe(version);
    // Cargo.lock pins the crate's own version too.
    expect(read('src-tauri/Cargo.lock')).toMatch(
      new RegExp(`name = "b-mark"\\nversion = "${version.replace(/\./g, '\\.')}"`),
    );
  });

  it('is not left at a placeholder in the installer script default', () => {
    // `!ifndef VERSION` is only a fallback for a human running makensis by
    // hand; it should not read as though 0.1.0 were current.
    const nsi = read('installer/b-mark.nsi');
    const fallback = /!ifndef VERSION\s*\r?\n\s*!define VERSION "([^"]+)"/.exec(nsi);
    expect(fallback).not.toBeNull();
    expect(fallback![1]).toBe(version);
  });
});
