# Project Handoff — B mark

> Updated 2026-10-11 (originally written 2026-08-24) for whoever maintains this
> project next. It complements [README.md](README.md) (what the product is),
> [BUILD.md](BUILD.md) (how to build it) and [RELEASING.md](RELEASING.md) (how
> to ship it). This document is about **how the codebase works, the current
> repository state, and where the traps are**.

---

## 1. One-screen summary

**B mark** is a free, MIT-licensed Markdown viewer for Windows 10/11, built
with **Tauri 2 + vanilla TypeScript** (no framework) and rendered through the
system's WebView2 runtime. Its reason for existing: every other viewer gets
**mixed Persian/English documents** wrong, because they derive a block's
direction from its *first* strong character (`dir="auto"`). B mark instead
*weighs* every block's strong characters (after stripping code spans, URLs,
paths and e-mails) and lets neutral blocks inherit from resolved neighbours.

| | |
|---|---|
| Version | 0.1.2 (first public release, 2026-08-23) |
| Frontend | TypeScript 5, Vite 6, Vitest 3, jsdom — **no UI framework** |
| Shell | Tauri 2 (Rust), five small command modules under `src-tauri/src/` |
| Tests | 432 unit tests, all frontend; Rust side verified by CI on Windows |
| Targets | x64 (supported), ARM64 (built by CI, openly experimental) |
| Languages | English + Persian UI, both catalogues checked for parity by a test |
| Non-negotiables | No telemetry, no background network, no silent downloads, per-user paths only, honest degradation |

The frontend is fully developable and testable on **Linux/macOS** — only the
final `.exe` needs Windows (see BUILD.md for cross-compiling with cargo-xwin).

## 2. Repository map

```
src/                      all application TypeScript
  main.ts                 app entry: layout, tabs, toolbar, shortcuts, boot
  direction/              ★ the direction engine (unicode.ts scores, apply.ts writes dir attrs)
  markdown/               render pipeline: renderer.ts (markdown-it config) → sanitize.ts
                          (DOMPurify) → math.ts / diagrams.ts (lazy KaTeX/Mermaid)
                          → frontmatter.ts (hand-rolled, strict) → pipeline.ts (orchestrator)
  persian/                fix.ts (text normaliser with masking), spellcheck.ts (dictionary
                          loader), words.ts (which words to check — the quality layer)
  editor/split-editor.ts  plain <textarea> + proportional scroll sync
  components/             documents (tabs), outline, find, lightbox, context-menu,
                          folder-panel, export (HTML/print), docx-export, rich-copy,
                          code-copy, stats, content-themes, spell-highlight, titlebar,
                          logo, icons
  settings/               schema.ts (defaults/clamps/migrations), store.ts (persist+apply),
                          panel.ts (the dialog)
  platform/               ★ host abstraction: host.ts (interface), tauri-host.ts,
                          browser-host.ts — everything touching the OS goes through here
  i18n/                   en.json / fa.json catalogues + t() with fallback chain
  styles/                 app.css (chrome), content.css (document), theme.css, fonts.css

src-tauri/src/            tiny Rust shell, five modules
  main.rs                 wiring + CLI/file-association argument parsing
  files.rs                read/write/list commands with extension allowlist + 32 MiB cap
  settings.rs             atomic per-user settings.json under %AppData%
  watcher.rs              debounced live-reload (notify-debouncer-full)
  webview2.rs             Windows-only registry *read* to detect the WebView2 runtime

tests/                    15 spec files, jsdom environment, single fork
assets/                   Vazirmatn fonts, Hunspell dictionaries (fa/en), branding, icons
installer/b-mark.nsi      hand-written per-user NSIS installer (reviewable registry writes)
scripts/                  build-portable.ps1, build-installer.sh, build-windows-cross.sh,
                          verify-exe.py (PE post-build checks), generate-branding.py
docs/                     historical phase reports + licences + design references
.github/workflows/        build-windows.yml: Linux check job gates the Windows build job
```

## 3. Architecture in one pass

**Render pipeline** (per keystroke, debounced 120 ms in the editor):

```
source ── splitFrontMatter ── markdown-it (+11 plugins, cached instance)
       ── DOMPurify (explicit ALLOWED_TAGS; never USE_PROFILES)
       ── target.innerHTML
       ── applyDirection   → per-block dir + data-bmark-dir, table/list majority vote
       ── chrome passes     (copy buttons, lightbox hooks, stats, themes, spell)
       ── enhance() lazily  (KaTeX / Mermaid only if the document needs them)
```

**Direction engine** (`src/direction/`):
- `scoreDirection()` strips noise (code, URLs, paths, e-mails, HTML tags),
  counts strong RTL vs LTR characters — Persian/Arabic digits and harakat are
  *carved out as neutral* via `RTL_BLOCK_NEUTRALS`, which matters enormously —
  and respects explicit bidi controls (RLM/LRM/RLE/LRE/RLI/LRI).
- `applyDirection()` runs three passes: self-deciding blocks, neutral blocks
  inheriting from resolved siblings → ancestors → fallback, then tables/lists
  orienting by majority vote of their cells/items.
- Threshold: a block is RTL when ≥ 30 % of strong chars are RTL
  (`RTL_THRESHOLD`). Calibrated by `tests/direction.spec.ts`.

**Host abstraction** (`src/platform/`): every OS capability is a method on the
`Host` interface. `BrowserHost` answers *honestly* (`canSave: false`, rejected
promises) so the UI disables buttons instead of silently failing. Anything new
that touches the filesystem, window, clipboard or network must go through this
interface — `main.ts` never imports `@tauri-apps/*` directly.

**Rust commands** (all user-initiated, none scan the disk):
`read_markdown_file`, `write_markdown_file`, `write_export_file` (extension
allowlist), `reveal_in_explorer`, `list_folder` (one level, 2000 entries),
`parent_folder`, `load_settings`, `save_settings`, `watch_file`, `unwatch_all`.

## 4. Invariants — do not break these

1. **The interface language never dictates the document's direction.** Chrome
   flips to RTL for Persian; the content root always carries its own `dir`.
2. **Nothing navigates the webview.** Links become `href="#"` + `data-external`
   and open through the host on an explicit click. Exports restore real hrefs.
3. **Honest degradation.** A capability that doesn't exist says so (disabled
   button, toast, rejected promise). No button may silently do nothing.
4. **Lazy loading.** KaTeX (3.9 MB), Mermaid, docx (4.5 MB), dictionaries —
   imported only when a document actually needs them. Keep the main bundle lean.
5. **No telemetry, no background network.** The updater contacts the GitHub
   releases endpoint only on an explicit click. There is no timer anywhere.
6. **File access is scoped to what the user opened.** The Rust side enforces an
   extension allowlist and a 32 MiB cap; `tauri-plugin-fs` was removed on
   purpose. Don't reintroduce it.
7. **Exports never leak.** `data-src` (blocked image URL) and every internal
   `data-*` attribute is stripped from HTML export and rich copy.
8. **Settings files are untrusted input.** Every field is coerced and clamped
   in `normalise()` on both read *and* write.
9. **Every UI string comes from `src/i18n/*.json`.** A test proves the two
   catalogues have identical shapes.
10. **Tests must fail against the bug before the fix.** CONTRIBUTING.md tells
    the story of the context-menu test that passed against broken code because
    jsdom dispatches differently than a browser. Verify red, then green.

## 5. Development workflow

```bash
npm ci
npm run dev          # browser build at http://localhost:1420 — full feature parity
                     # minus save/window controls (the browser host degrades honestly)
npm run tauri:dev    # the real desktop window (Windows + Rust toolchain)
npm test             # 432 tests, single fork — see vite.config.ts for why
npm run typecheck
npm run build        # tsc --noEmit && vite build → dist/
```

CI (`.github/workflows/build-windows.yml`): a Linux `check` job runs typecheck,
tests and an icon-drift warning; only then does the Windows job build x64 and
ARM64, run `verify-exe.py`, build the NSIS installer and upload artifacts.
Release publishing is **opt-in** via the `AUTO_PUBLISH` repository variable —
by design, so a human decides what ships (see the comments in the workflow).

## 6. Test map

| Spec | Covers |
|---|---|
| `direction.spec.ts` | scoring, thresholds, bidi controls, inheritance |
| `pipeline.spec.ts`, `markdown.spec.ts` | render pipeline, sanitiser (incl. the USE_PROFILES bypass regression), front matter data-loss regression, math disambiguation |
| `persian.spec.ts` | every fix rule + masking (code/URLs/math must survive untouched) |
| `features.spec.ts` | outline, search folding (length-preservation is tested), find, stats, HTML export, math, extra syntax |
| `export-themes.spec.ts`, `export-target.spec.ts` | DOCX OOXML (`<w:bidi/>`/`<w:rtl/>` assertions on the raw XML), content themes, rich-copy targets |
| `overflow.spec.ts` | the "nothing escapes the frame" spec at 360/430/1200 px |
| `settings.spec.ts` | clamping, migrations, corrupt-file survival |
| `documents.spec.ts`, `editor.spec.ts`, `context-menu.spec.ts`, `i18n.spec.ts`, `platform.spec.ts` | tabs, textarea editor, menu behaviour, catalogue parity, host degradation |
| `boot.spec.ts` | **boots `main.ts` in jsdom** — the only coverage for app wiring; extend it when touching boot, tabs or shortcuts |

jsdom limitations to remember: its `Blob` has no `arrayBuffer()`/`text()`
(DOCX tests unzip raw bytes instead; drop tests duck-type files), and it has
no `matchMedia` (the boot test mocks it).

## 7. Gotchas learned the hard way

These are the traps that already cost time; read before refactoring:

- **Dictionaries vs CSP.** Vite inlined the 2.6 KB `en.aff` as a `data:` URL
  and the CSP blocked the fetch — English spell check silently never loaded.
  `vite.config.ts` now forces every `.aff/.dic` to be emitted as a file. Don't
  remove that `assetsInlineLimit` rule.
- **DOMPurify profiles override allowlists.** Setting `USE_PROFILES` silently
  re-admits the whole HTML profile over an explicit `ALLOWED_TAGS`. Never set it.
- **Front matter splitting must be strict.** `markdown-it-front-matter` swallows
  a document whose opening `---` never closes. The hand-rolled splitter only
  accepts a block with a real closing delimiter — losing a document to a
  formatting guess is the cardinal sin here.
- **The watcher watches the parent directory** (editors replace files via
  rename, which drops a direct file watch) and therefore **must filter events
  to the watched path** — otherwise any sibling file saving reloads every open
  tab from that folder. The frontend *also* compares content before reloading,
  because B mark's own Ctrl+S fires the watcher too.
- **`docs.open()` activates the tab.** Anything that merely refreshes content
  (live reload) must update in place instead, or a background file change will
  steal focus from what the user is reading.
- **`foldForSearch` must stay length-preserving** or search offsets shift —
  including for characters whose lowercase is longer (`İ` → `i`+dot). Guarded
  and tested.
- **The `custom-protocol` cargo feature embeds the frontend.** Without it a
  release build opens a blank window. `verify-exe.py` fails the build if any
  asset is missing from the PE.
- **Static CRT** is pinned in `src-tauri/.cargo/config.toml` (`+crt-static`);
  the portable exe must not import `VCRUNTIME*.dll`.
- **`renderTabs()` and friends rebuild innerHTML on every chrome refresh.**
  Event handlers for persistent elements bind **once at boot** (`bindTabStrip`,
  `bindShortcuts`, …). Don't move `addEventListener` calls back into render
  functions — even though the DOM dedupes identical listeners, fresh closures
  would accumulate.
- **Spell check costs ~172 MB of heap and ~2 s** (Persian Hunspell affix
  complexity). It stays off by default and the settings panel says so.
- **DOM listener dedupe:** registering the *same function reference* twice is a
  no-op per spec. If you ever suspect duplicate handlers, the question is
  whether the closures are identical, not how often `addEventListener` ran.

## 8. Known limitations (be honest about these)

- **Relative images are placeholders.** `![a](./img.png)` renders as a labelled
  box; resolving them needs the Tauri asset protocol scope per opened folder.
  Deliberate, documented in `app.css` and the README.
- **The exe has run under Wine, not a physical Windows machine** (at release
  time). Everything inside the window is the frontend, covered by tests.
- Saving is unavailable in the browser build (by design, reported honestly).
- Editor↔preview scroll sync is proportional, not line-accurate.
- Releases are **unsigned**; SmartScreen/AV heuristics can warn. SECURITY.md
  states exactly what is and isn't claimed.
- The DOCX exporter handles images as labelled placeholders (embedding would
  need fetching + media parts).

## 9. Release checklist (short form — RELEASING.md is canonical)

1. Bump the version in **three places**: `package.json`,
   `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Add a `[x.y.z]` section to CHANGELOG.md — the house style records every bug
   found and *why*, not just what changed.
3. `npm run typecheck && npm test`; regenerate icons if any SVG changed
   (`python scripts/generate-branding.py`) and commit the PNGs/ICO.
4. Push the tag `v*` — CI builds, verifies (`verify-exe.py`), checksums and
   uploads artifacts. Publishing to the Release needs `AUTO_PUBLISH=true`.
5. Dist binaries staged by hand live in `dist-release/v<version>/` (the folder
   and README are tracked, executables are not).

## 10. Maintenance duties

- **Dependabot** is configured with grouped updates — ungrouped it opened nine
  PRs in five minutes once. Keep it grouped.
- After any dependency bump: `npm test`, `npm run build`, and for anything
  touching `markdown-it`/DOMPurify re-check the sanitiser and pipeline specs.
- **i18n:** add every new string to *both* catalogues; the parity test fails CI.
- **Icons:** edit the SVG masters in `assets/branding/`, then run
  `scripts/generate-branding.py`; CI warns on drift.
- **Settings schema:** new settings need a default, a clamp/pick rule in
  `normalise()`, a panel control, and (if behavioural) a test.

## 11. Work completed 2026-08-24

A line-by-line review of the codebase; all fixes are on branch
`arena/01a0326d-b-mark` with regression tests (424 → 432 tests):

- `watcher.rs` — file-changed events now filtered to the watched file itself.
- `main.ts` — live reload compares content before reloading (own saves no
  longer toast/reload); reloads update in place without stealing focus; tab
  strip handlers bind once at boot; closing a tab restores the surviving tab's
  scroll position.
- `docx-export.ts` — loose nested lists no longer emit the parent item twice.
- `export.ts` — content-theme CSS now travels into HTML export and print.
- `find.ts` — search folding stays length-preserving for `İ`-class characters.
- `browser-host.ts` — multi-file drops open every file.
- `apply.ts` — dead code removed from `inheritFor`.
- New `tests/boot.spec.ts` — first coverage for `main.ts` boot and tab wiring.

## 12. Full Audit Findings — 2026-10-11 (Open Bugs & CI/PR Status)

A full audit of the codebase, GitHub Actions runs, open issues, and pull
requests on **2026-10-11** identified the following actionable items:

### A. Application Bugs

1. **Double-clicking `.md` files in Explorer / CLI args opens an empty window (Issue #14):**
   - **Root cause:** In `src-tauri/src/main.rs` (lines 76–89), `.setup(|app| ...)` collects CLI file paths via `collect_cli_files()` and immediately calls `handle.emit("b-mark://open-files", paths)`. However, `.setup()` runs synchronously *before* WebView2 finishes loading `index.html` and running `boot()` in `src/main.ts` (which awaits `store.load()`, dynamically imports `@tauri-apps/api/event`, and registers `listen('b-mark://open-files')`). Because Tauri events are fire-and-forget, the event is dropped before any frontend listener exists.
   - **Fix:** Store startup CLI paths in Tauri managed state (e.g. `Mutex<Vec<String>>`) and expose a `#[tauri::command] fn take_startup_files(...) -> Vec<String>` command that `TauriHost.onOpenRequest` invokes once after registering the listener.

2. **Relative local images do not render (Issue #14):**
   - **Root cause:** `src/markdown/renderer.ts` keeps relative image `src` attributes and sets `data-relative-src`, which resolves against the WebView origin (`http://tauri.localhost/...`) rather than the document's folder on disk. Additionally:
     - `read_markdown_file` in `src-tauri/src/files.rs` does not call `app.asset_protocol_scope().allow_directory(...)` for the opened document's parent folder.
     - `DocumentSet.open()` in `src/components/documents.ts` does not persist the file's directory path (`dir` on `DocumentTab` stores the `'rtl' | 'ltr'` direction of the tab label).
     - `img[data-relative-src]` elements are not rewritten with `convertFileSrc` from `@tauri-apps/api/core`.

3. **Relative document links (`a[data-relative]`) silently do nothing:**
   - **Root cause:** `src/markdown/renderer.ts` (line 136) rewrites relative links (e.g. `[Persian README](README.fa.md)`) to `href="#"` + `data-relative="..."`, but `bindLinks()` in `src/main.ts` (lines 651–670) only handles `data-anchor` and `data-external`, ignoring `data-relative` (violating Invariant #3: honest degradation / no silent no-ops).

### B. Three Chained Windows CI Bugs (`.github/workflows/build-windows.yml`)

While the Linux `check` job (`Typecheck and tests`) passes all 432 tests on `main`, the Windows `Portable exe` job on commit `8553f30` fails at step 12 (`Verify the executable`):

1. **`+crt-static` is ignored when invoking Cargo from the repo root:**
   - The workflow runs `cargo build --release --target ${{ matrix.target }} --manifest-path src-tauri/Cargo.toml` from the repository root. Cargo looks up `.cargo/config.toml` from the current working directory (`$PWD`), *not* from `--manifest-path`'s directory (`src-tauri/.cargo/config.toml`). As a result, `rustflags = ["-C", "target-feature=+crt-static"]` is skipped, `b-mark.exe` links dynamically against `VCRUNTIME140.dll`, and `scripts/verify-exe.py` fails on `no Visual C++ Redistributable dependency`.
   - **Fix:** Set `working-directory: src-tauri` on the `cargo build` step (or pass `CARGO_TARGET_*_RUSTFLAGS`).

2. **`release/B mark.exe` is deleted before `makensis` builds the installer:**
   - Contrary to the note in `CHANGELOG.md` (lines 48–55), in `.github/workflows/build-windows.yml` (lines 136–155) the step `Name the portable asset after its version` (which runs `Remove-Item "release/B mark.exe"`) is **still placed before** `Build per-user installer`, even though `installer/b-mark.nsi` requires `..\release\B mark.exe` at compile time.
   - **Fix:** Move `Name the portable asset after its version` *after* `Build per-user installer`.

3. **`scripts/verify-exe.py` hardcodes x86-64 machine type (`0x8664`):**
   - Line 61 checks `pe.FILE_HEADER.Machine == 0x8664`, which unconditionally fails on the `arm64` matrix leg (`0xAA64`).

### C. Open Dependabot Pull Requests

- **PR #15** (Rust group in `/src-tauri`) & **PR #16** (npm production group): pass Linux typecheck and all 432 tests; only fail on the Windows CI bugs above.
- **PR #17** (npm development group — major bumps to TypeScript 7, Vite 8, Vitest 5, jsdom 30): fails `npm run typecheck` in 20s and requires major-version migration before merging.
- **PR #12** (`actions/download-artifact` v7 → v8): only fails on the Windows CI bugs above.
- **PR #3** & **PR #6**: older ungrouped Cargo PRs superseded by PR #15; safe to close.

## 13. Suggested next steps (in priority order)

1. **Fix the three Windows CI bugs** in `.github/workflows/build-windows.yml` and `scripts/verify-exe.py` so the Windows build pipeline turns green.
2. **Fix CLI / file-association opening on double-click (Issue #14)** by adding a startup-files command in `src-tauri/src/main.rs` and pulling it in `src/platform/tauri-host.ts`.
3. **Resolve relative images (Issue #14)** and **relative links (`data-relative`)** via Tauri's asset protocol (`allow_directory` + `convertFileSrc`) scoped to the opened document's folder.
4. **Triage Dependabot PRs** (close #3 and #6; re-run and merge #12, #15, #16 once Windows CI is fixed).
5. **Code signing** — the biggest remaining trust win to avoid SmartScreen warnings.
6. **Line-accurate scroll sync** using markdown-it token `map` data, and DOCX image embedding.

## 14. Handover checklist

- [ ] Read this document, then `docs/00-research.md` (the *why* of the direction engine)
- [ ] `npm ci && npm test && npm run build` on your machine
- [ ] `npm run dev`, open `tests/fixtures/stress.md` via the Sample button
- [ ] Skim CHANGELOG.md 0.1.1/0.1.2 — it is the record of every trap above
- [ ] Review Section 12 above (Issue #14 and the three Windows CI bugs) before cutting `0.1.3`
- [ ] Read SECURITY.md before answering any security question publicly
- [ ] Know where the three version strings live before cutting any release
