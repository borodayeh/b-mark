# Project Handoff — B mark

> Written 2026-08-24 for whoever maintains this project next. It complements
> [README.md](README.md) (what the product is), [BUILD.md](BUILD.md) (how to
> build it) and [RELEASING.md](RELEASING.md) (how to ship it). This document
> is about **how the codebase works and where the traps are**.

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
| Tests | 459 unit tests, all frontend; Rust side verified by CI on Windows |
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
npm test             # 459 tests, single fork — see vite.config.ts for why
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
- **Static CRT** is pinned in `.cargo/config.toml` at the *repository root*
  (`+crt-static`). It used to sit in `src-tauri/.cargo/`, where cargo never
  reads it from: config discovery walks up from the invocation directory, not
  from the manifest's. CI invokes cargo with `--manifest-path` from the root,
  so the flag silently did nothing there and the exe needed the VC++
  Redistributable — which is what `verify-exe.py` has been failing on for 25
  straight runs. Do not move it back; `tests/build-config.spec.ts` guards the
  location.
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

1. Bump the version in **four places**: `package.json`, `package-lock.json`
   (both the root field and `packages[""].version`), `src-tauri/Cargo.toml`
   (plus the `b-mark` entry in `Cargo.lock`), and `src-tauri/tauri.conf.json`.
   The two lockfiles had drifted to 0.1.0/0.1.2 while `package.json` said
   0.1.2 — nothing noticed, because nothing checks them.
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

## 11. Work completed 2026-10-11 (latest session) — release 0.1.3

A review pass over the whole codebase against the release scripts and CI, on
branch `arena/e9c6e2a5-b-mark` with regression tests (432 → 459 tests). Full
list in `docs/07-next-version-review.md`; user-visible record in CHANGELOG.md
under 0.1.3.

- `build-windows.yml` — the installer step now runs before the portable rename.
  0.1.2's changelog claimed this was already done; it was not, so CI produced
  no installer at all since 0.1.2. Verified by extracting the `- name:` lines in
  order (`pyyaml` is not installed here).
- `files.rs` — new private `atomic_write` (sibling temp + rename) used by
  `write_markdown_file` and `write_export_file`. **Not compiled locally: there
  is no cargo in this sandbox.** Review plus CI is the only check it has.
- `math.ts` — `hasMath` no longer answers "yes" for a lone `$`, so a price
  list no longer downloads KaTeX.
- `main.ts` — `fixPersian` now requires the editor (it was silently editing and
  saving documents you were only reading); the auto-save timer is bound to the
  tab it was started for, not to whichever tab is active when it fires;
  `folderOpen` resets with the other chrome flags.
- `stats.ts` — `characters` and `words` are measured on the same text, so the
  status bar no longer reports "3 words · 1007 characters".
- `context-menu.ts` — one `openMenu` shared by every menu, with arrow/Home/End/
  Tab/Escape navigation and focus restore; `openTabMenu` and
  `openSuggestionMenu` built on it. This activated `closeOthers`/`closeAll`
  (dead since 0.1.2) and gave `spellcheck.suggest()` its missing UI.
- `split-editor.ts` — `replaceRange(start, end, text)`, so a spelling
  correction lands in the editor where caret and buffer share one coordinate
  system. Uses `execCommand('insertText')` first, so native undo survives.
- `words.ts` — `looksWorthChecking` is now consulted before the DOM walk, and
  `outline.ts`'s dead `get count()` is gone.
- `.cargo/config.toml` moved from `src-tauri/.cargo/` to the repository root,
  which is the whole of the fix for the 25-run red build. See
  `tests/build-config.spec.ts` for the reasoning, and do not move it back.
- `installer/b-mark.nsi` — `SRCEXE` now resolves at compile time with a
  fallback to the versioned portable exe, so the installer cannot be broken by
  the order of the CI steps. The workflow reorder is the primary fix; this is
  defence in depth, and it is the one change here that could not be run
  through makensis (no NSIS toolchain in the sandbox) — review only, like the
  Rust side.
- `build-portable.ps1` — icon regeneration is opt-in behind `-RegenerateIcons`,
  because `generate-branding.py` imports cairosvg and a stock Windows machine
  has no Cairo. The icons are committed and current.
- `main.ts` — the Escape/F11 handlers catch a failed window query instead of
  leaving an unhandled rejection. (Found by the test suite: `context-menu.spec.ts`
  drives Escape, and the specs share one window in this pool, so a leaked
  `main.ts` instance called the real Tauri API.)
- The 0.1.2 changelog's two "part of 0.1.2" workflow fixes now ship in 0.1.3.

## 12. Work completed 2026-08-24 (previous session)

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

## 13. Suggested next steps

Spelling suggestions were on this list and are now shipped in 0.1.3; the rest
still stands.

1. **Code signing** — the only open roadmap item; the biggest trust win left.
2. **Relative image resolution** via the Tauri asset protocol, scoped to the
   opened document's folder.
3. **Line-accurate scroll sync** using markdown-it token `map` data.
4. DOCX image embedding (fetch + relationship/media parts).
5. A real Windows smoke machine for release sign-off (currently Wine-only).
6. Relative-image resolution and "Save As" were both named in the 0.1.3 review
   as still-needed and remain unimplemented.

## 14. Handover checklist

- [ ] Read this document, then `docs/00-research.md` (the *why* of the direction engine)
- [ ] `npm ci && npm test && npm run build` on your machine
- [ ] `npm run dev`, open `tests/fixtures/stress.md` via the Sample button
- [ ] Skim CHANGELOG.md 0.1.1/0.1.2 — it is the record of every trap above
- [ ] Read SECURITY.md before answering any security question publicly
- [ ] Know where the four version strings live before cutting any release
- [ ] Know which Rust changes have never been compiled (no cargo in the
      sandbox — `atomic_write` in 0.1.3 is one of them)
