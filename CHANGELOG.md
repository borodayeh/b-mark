# Changelog

All notable changes to B mark are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

> **0.1.2 is the first public release.** 0.1.0 and 0.1.1 were built and tested
> but never published anywhere; their entries are kept because the bugs they
> record are real and the reasoning is worth having. Nothing was ever
> distributed under those numbers.
>
> The workflow fixes below are also part of 0.1.2 rather than a 0.1.3: they
> land before the tag exists, and none of them changes a byte of the
> application. Inventing a version number for a repository-only change would
> mean shipping new binaries that behave identically to the ones already
> tested — churn with nothing behind it.

## [Unreleased]

### Fixed
- **Any file saving in the same folder reloaded every open tab from it.**
  The watcher watches the parent directory (editors replace files via rename,
  which drops a direct file watch), but the debouncer callback emitted a
  change for *every* Modify/Create event in that directory regardless of which
  file caused it. Events are now filtered to the watched path itself.
- **B mark's own save toasted "file changed on disk" and re-rendered.**
  Ctrl+S writes exactly the bytes already in the buffer, and the watcher then
  fired for the file itself. The reload path now reads the file first and does
  nothing when the content is unchanged.
- **A background file changing stole focus.** The reload went through
  `docs.open()`, which activates the tab — so a background document being
  saved elsewhere yanked the reader to it. The buffer is now updated in place
  and only the visible tab re-renders.
- **DOCX export emitted loose list items twice.** Recursing into the `<li>`
  to reach a nested list re-walked the item's `<p>` child (loose lists wrap
  item text in paragraphs), so a parent item with a nested list appeared two
  times in Word. The exporter now recurses into each nested `ul`/`ol`
  directly — which also handles items containing more than one nested list.
- **The content theme never survived the HTML export or print.** The clone
  carried its `data-theme-content` attribute and inline theme variables, but
  the theme rules themselves live in a stylesheet injected into the app's
  `<head>`, so book/academic/compact silently fell back to default for the
  recipient. The rules are now baked into the standalone file.
- **Search highlighting could shift after an `İ`.** `foldForSearch` must stay
  length-preserving or the folded offsets do not map back onto the real text
  node, but a few characters lowercase to a longer string ('İ' → 'i' +
  combining dot). Where the fold cannot stay one-for-one the original
  character is now kept, so matching such a word stays case-sensitive instead
  of misaligning every later highlight.
- **A multi-file drop opened only the first file** in the browser build.
- **Closing a tab kept the closed tab's scroll position** on the tab that
  takes focus; it now returns to that tab's saved position, as switching does.

### Changed
- The tab strip's click handlers bind once at boot instead of being
  re-registered on every chrome refresh (which runs per keystroke in the
  editor). Harmless today — the DOM deduplicates identical listeners — but it
  removes the per-render registration and makes the guarantee explicit.

### Added
- `tests/boot.spec.ts` — boots `main.ts` under jsdom and exercises the tab
  wiring, the first coverage for the application entry at all.

### Fixed — build and infrastructure
- **The Windows CI job could never compile the app.** It ran `cargo build`
  straight after `npm ci`, but `tauri::generate_context!` embeds the frontend
  from `frontendDist` (`../dist`) at compile time — a directory only `vite
  build` creates. The `beforeBuildCommand` in `tauri.conf.json` is honoured
  only by the `tauri build` CLI, which this job deliberately bypasses, so the
  build panicked with "`frontendDist` ... doesn't exist". The job now runs
  `npm run build` before cargo, as `scripts/build-windows-cross.sh` has
  always documented ("MUST run before cargo: the assets are baked in"). The
  failure surfaced only now because the previous job died earlier, at the
  cairosvg icon step fixed in 0.1.2, and never reached the compiler.
- **The installer step compiled against an exe that no longer existed.** The
  job renamed `release/B mark.exe` to its versioned portable name — and
  deleted the original — *before* running makensis, whose `File
  "..\release\B mark.exe"` directive resolves at NSIS compile time. The
  rename now happens after the installer build, matching
  `scripts/build-installer.sh`.

## [0.1.2] — 2026-08-23

### Fixed
- **Every right-click menu entry did nothing.** The dismiss handler was a
  *capturing* `mousedown` listener on `window`, so pressing an entry removed
  the menu from the document before the browser could dispatch the `click`
  that carried the action — and a browser does not dispatch `click` at a
  target that left the document between mousedown and mouseup. Entries now
  act on `mousedown`, and the dismiss handler ignores presses inside the menu.
  Covered by tests that were verified to fail against the old code.
- **Resizing the window with the menu open threw.** The same handler called
  `menu.contains(event.target)`, and `resize`/`blur` target the window, which
  is not a Node.

### Fixed — build and infrastructure
- **The Windows job could never have worked.** It ran
  `python scripts/generate-branding.py`, and cairosvg needs the native Cairo
  library, which the Windows runner image does not ship: `import cairosvg`
  dies with `no library called "cairo-2" was found`. The icons are committed,
  so the Windows job now simply uses them and only checks they are present
  and non-empty.
- **The drift check moved to Linux**, where Cairo installs in a second, and
  reports drift as a warning rather than failing. It was previously
  `git diff --exit-code`: cairosvg and Pillow are installed unpinned, so a
  runner with different versions antialiases differently and the bytes differ
  even though the artwork is identical. Byte-comparing generated binaries
  across machines is not a check.

### Changed — build and infrastructure
- GitHub Actions bumped past the Node 20 deprecation warning, and Dependabot
  updates grouped — ungrouped it opened nine pull requests within five minutes
  of the repository going public.
- Concurrent builds of the same ref cancel each other, except for tags, which
  publish a release.
- The ARM64 leg of the build matrix is `continue-on-error`. BUILD.md has always
  called ARM64 experimental because nobody has run it on ARM64 hardware; a
  target described that way must not turn the whole repository red.

## [0.1.1] — 2026-08-23

### Added
- **The version is now printed on the start screen** and in Settings ▸ About,
  with a build timestamp. Every "that fix did not land" report so far has
  needed this first, and nothing on screen answered it.

### Fixed
- **Exports were never written.** HTML and DOCX export created a blob URL and
  clicked an `<a download>`. There is no download manager behind an anchor in
  WebView2, so the click was dropped — and the app still reported "exported
  document.docx". Both now go through a real save dialog and a Rust
  `write_export_file` command, and a cancelled dialog no longer claims success.
- **The English dictionary could never load.** `en.aff` is 2.6 KB, so Vite
  inlined it as a `data:` URL; the app's CSP allows `connect-src 'self' ipc:`
  but not `data:`, so the fetch was blocked and English spell checking
  silently did nothing. Dictionaries are now always emitted as files.
- **The spell-check switch did nothing at all.** The setting was stored and
  read by nobody. It now underlines misspellings in the rendered document via
  the CSS Custom Highlight API — no wrapper spans, so no interference with the
  direction engine, find, or copy — and reports a count in the status bar.
- **No way back to the start screen.** With a single document open the tab
  strip is hidden, so the only close affordance was Ctrl+W, with nothing on
  screen to suggest it. Added a close button to the toolbar.
- **The start screen was not centred.** `.empty` is a flex child of a row
  container; with the default `flex: 0 1 auto` it was only as wide as its
  content and sat against the inline-start edge, so `align-items: center` had
  nothing to centre it against.

### Changed
- **Session restore is off by default**, and stored settings migrate from v1
  to v2 to turn it off for people who already had it on. Switching it off now
  also erases the recorded list rather than leaving a note of what was open.

### Added
- **About section in Settings** — app version (read from `package.json` at
  build time, so it cannot drift), authorship, and links to the repository and
  the licence. The links are opened in the system browser through the host;
  they never navigate the webview itself.
- **Per-block text direction engine** (`src/direction/`). Strips code spans,
  URLs, Windows and POSIX paths, e-mail addresses and HTML tags out of a
  block, weighs the remaining strong characters, and lets neutral blocks
  inherit from resolved neighbours. Tables and lists orient by majority vote
  of their cells and items. Explicit Unicode bidi controls (RLM/LRM/RLE/LRE/
  RLI/LRI) override the heuristic.
- **Markdown pipeline** (`src/markdown/`): CommonMark + GFM via markdown-it,
  task lists, Persian-safe heading anchors, DOMPurify sanitisation, and
  highlight.js with 27 curated languages.
- **Themes** — light, dark, and auto following the Windows setting, driven
  entirely by CSS custom properties.
- **Vazirmatn v33.003** bundled, all nine weights plus the variable font, with
  `local()` preferred so an installed copy wins over the bundled one.
- **Overflow containment** (spec §7) with 23 dedicated tests, verified at
  360 px, 430 px and 1200 px window widths.
- **Brand identity** — the supplied artwork traced to vector (shape IoU 0.996,
  mean pixel delta 1.18/255), with a simplified master for 16/24 px icon
  frames and a `currentColor` monochrome mark for in-app UI.
- **Rust shell** (`src-tauri/`): file reading with a 32 MiB cap and lossy UTF-8
  decode, atomic per-user settings persistence, debounced live reload, CLI
  argument and file-association handling.
- Portable and per-user NSIS build pipeline, GitHub Actions workflow for x64
  and experimental ARM64, SHA-256 checksums on release.
- **Bilingual interface** (English / Persian) with the chrome flipping to RTL
  for Persian, while the document keeps its own per-block direction. All 109
  strings live in `src/i18n/*.json`; a missing translation fails CI.
- **Settings panel** with 19 options applied live and persisted, backed by
  `%AppData%` under Tauri and `localStorage` in the browser. Every field is
  coerced and clamped on both read and write, so a hand-edited or corrupt
  settings file degrades to defaults instead of breaking the app.
- Six accent palettes, each carrying separate light-text, dark-text, fill and
  ink colours so contrast holds in both themes.
- Context menu built from the live selection and the element under the cursor,
  which flips rather than overflowing near a window edge.
- `Ctrl+,` opens Settings; `F11` toggles full screen; `Esc` closes the topmost
  layer.
- **Host abstraction** (`src/platform/`) with Tauri and browser backends. The
  browser backend degrades honestly — `canSave: false`, rejected promises for
  capabilities it does not have — so the UI disables or explains rather than
  offering a button that silently does nothing.
- **Split editor**: source pane beside a live preview, proportional scroll
  sync, `Ctrl+S` to save, `Ctrl+E` to toggle. A plain `<textarea>` on purpose:
  the platform's own bidi caret handling, IME and selection are exactly what a
  Persian writer already expects, and a code-editor component would have added
  300 KB–2 MB for no benefit here.
- Unsaved-change tracking with a status-bar flag, a reload confirmation, and a
  `beforeunload` guard. When a watched file changes on disk while the buffer is
  dirty, B mark says so instead of discarding the edits.
- **WebView2 detection** (`src-tauri/src/webview2.rs`). Without the runtime a
  Tauri window never appears and the user gets no explanation at all; B mark
  now checks the registry first and shows a bilingual native message box. It
  reads the registry, never writes, and never downloads anything.
- Tauri 2 capability manifest listing every permission, each justified in
  SECURITY.md.

### Added — release polish
- **Custom title bar.** The window is now frameless and the app draws its own
  caption: brand mark, document name with a dirty dot, and Windows-metric
  minimise / maximise / close buttons at 46×32 with the close button tinting
  red on hover. Double-clicking the caption maximises. The controls stay on the
  right even in the Persian RTL interface, because that is an OS convention
  rather than a reading-order one, and they are hidden entirely in the browser
  build where there is no window to control.
- **Proper settings icon.** The old glyph was a circle with eight radial ticks,
  which reads as a sun or a spinner; it is now a conventional toothed cog.
- **The brand mark, used properly.** `bmark-mark.svg` is now inlined in the
  title bar, the recent-files list and exported documents, with the white half
  of its gradient bound to `currentColor` so it reads on both themes while the
  lime half — the recognisable part — stays constant.
- **Outline sidebar** built from the rendered DOM, so it lists the headings
  actually on screen with the ids the anchor plugin produced. Each entry
  carries its own resolved direction. The active entry tracks the scroll
  position via IntersectionObserver with a top-biased root margin, which avoids
  the flicker a naive "topmost visible heading" rule produces.
- **Find in document** with Persian-aware folding: ی/ي, ک/ك, ة/ه, ZWNJ and
  Arabic-Indic and Persian digits all fold, and the folding is length-preserving
  so match offsets stay valid. Painted with the CSS Custom Highlight API, which
  highlights without touching the DOM and therefore cannot disturb the direction
  attributes the engine just resolved.
- **Self-contained HTML export** with the Vazirmatn weights inlined as data
  URIs, so the file renders Persian on a machine with no Persian font and makes
  no network request when opened.
- **Print / Save as PDF** through a hidden iframe carrying a print stylesheet:
  no page breaks inside code, tables or images, and link targets printed in
  parentheses.
- **Reading statistics** — word count and estimated reading time, with code
  excluded from the count and a slower words-per-minute figure for
  Arabic-script prose. ZWNJ is not treated as a word separator, so "می‌خواهم"
  counts as one word.
- **Copy button** on every code block, with a `document.execCommand` fallback
  when clipboard permission is refused.
- **Recent files** on the start screen.

### Fixed — found by the new tests
- **A blocked remote image leaked its URL into exported HTML.** The image was
  correctly not rendered, but `data-src` still held the original URL, so an
  exported file carried the tracker address the user had chosen to block into a
  document they might then email. All internal `data-*` attributes are now
  stripped from the export.
- **The blocked-image replacement never fired.** markdown-it emits `src=""`
  rather than omitting the attribute, so the `img[data-remote]:not([src])`
  selector matched nothing.
- **`CSS.escape` was called unguarded** in the anchor-navigation click handler.
  It exists in every targeted browser, but a handler that throws leaves the UI
  wedged, so it now falls back.
- **The print stylesheet keyed link URLs off `data-external`**, which the export
  now strips — printed links would have lost their targets. It uses the real
  `href` instead.

### Added — v0.2 feature set

**Markdown completeness**
- **YAML front matter** is parsed and shown as a metadata card with the title,
  subtitle and remaining keys, each field carrying its own resolved direction.
- **Footnotes**, **definition lists**, `==mark==`, `++ins++`, `~sub~`, `^sup^`.
- **Math** via KaTeX and **diagrams** via Mermaid, both loaded lazily. A
  document containing neither downloads neither; the main bundle stays at
  412 KB and the libraries arrive only when a `$…$` or a ```mermaid fence
  actually appears. Until KaTeX resolves, each formula shows its own source
  rather than a blank space.

**Persian text tooling** — the part no other editor does properly
- One command normalises Arabic ي ك ة to Persian ی ک ه, inserts the ZWNJ in
  می‌/نمی‌ prefixes and ‌ها/‌تر/‌ترین suffixes, tightens the spacing around
  punctuation, converts `, ; ?` to `، ؛ ؟` in Persian prose, and optionally
  switches digit style. Every rule is individually switchable.
- **Code, URLs, Windows paths, e-mail addresses and formulas are masked out
  before any rule runs**, so `کتاب ها` becomes `کتاب‌ها` while `some_var ها`
  inside a code span is untouched. The transform is idempotent.
- `Ctrl+Shift+Space` inserts a ZWNJ at the caret — the most-typed Persian
  character that no keyboard layout puts anywhere convenient.

**Workflow**
- **Tabs** with middle-click close, `Ctrl+Tab` cycling, `Ctrl+1..9`, and a
  confirmation before closing a dirty buffer. The strip hides itself when only
  one document is open.
- **Session restore** by path, not by content: storing the text of every open
  document in browser storage would duplicate the user's files and is a
  privacy surprise. A file that has moved is reported once, not per launch.
- **Auto-save**, off by default, firing a few seconds after typing stops.
- **Copy as formatted text** — writes `text/html` and `text/plain` together, so
  pasting into Word, Outlook or Telegram keeps the formatting *and* the
  per-block direction. A Persian paragraph arrives right-aligned without
  anyone touching a paragraph setting.
- **Image and diagram lightbox** with pointer-anchored wheel zoom and drag.

### Fixed — found by the new tests

- **A document beginning with `---` was rendered as a blank page.**
  `markdown-it-front-matter` treats an unterminated opening delimiter as
  running to the end of the file, so `---` followed by prose silently consumed
  the entire document. Front matter is now split out by our own code, which
  requires the closing delimiter to exist; anything else is left to the parser
  as an ordinary horizontal rule. Losing a user's document to a formatting
  guess is not an acceptable failure mode, and the dependency is gone.
- **`from $5 to $10` parsed as a formula.** Added Pandoc's two disambiguation
  rules: the closing `$` may not be preceded by whitespace nor followed by a
  digit. Prose is full of currency.
- **A dotted underline on `<ins>` cut straight through Persian descenders**
  (ن ی ش ه ج), leaving the word looking corrupted. Replaced with a bottom
  border, which sits on the box edge and clears the script — the same reason
  links here have always used `border-bottom` rather than `text-decoration`.
- **The e-mail mask used `\w`**, which is ASCII-only in JavaScript, so an
  address with Persian letters in the local part was not protected and got
  rewritten by the letter normaliser.

### Removed
- `tauri-plugin-fs`, which was declared but never used. All file access goes
  through our own commands with an extension allowlist and a size cap; the
  general-purpose plugin would have granted the frontend far broader disk
  access than a Markdown viewer needs.

### Fixed during development
- **Sanitiser bypass.** DOMPurify's `USE_PROFILES` option overrode the explicit
  `ALLOWED_TAGS` allowlist, silently re-admitting the whole HTML profile.
- **Persian and Arabic-Indic digits counted as strong RTL.** U+0660–0669 and
  U+06F0–06F9 sit inside the Arabic block but their Bidi class is AN/EN, i.e.
  neutral. A numeric table cell was claiming RTL. Twenty-three carve-out
  ranges added, also covering harakat and Hebrew points (NSM).
- **Blockquotes always resolved LTR** because they contain no direct text, only
  nested `<p>`. Container blocks now fall back to descendant prose.
- **A numeric list item between Persian siblings resolved LTR** because its
  `<ul>` had not been oriented yet. Neutral blocks now inherit from resolved
  siblings before ancestors.
- **Persian inside code blocks rendered as disconnected letters.** Vazirmatn is
  now appended to the monospace stack; glyph-level fallback keeps Latin
  monospaced while Arabic-script characters get proper shaping.
- **Toolbar controls clipped below ~500 px.** The toolbar now sheds
  non-essential controls at four breakpoints instead of hiding them under an
  `overflow: hidden` edge.
- **Windows paths truncated at the drive letter in error messages.**
  `message.split(':', 2)` turned `unsupported_extension:C:\tmp\x.exe` into a
  detail of just `C`, so the user was told the offending file was named "C".
  Now split on the first colon only.
- **`document.execCommand` called without a feature test.** It is absent in
  jsdom and browsers may eventually drop it; the editor's Tab handler threw
  instead of falling back to the manual insert path.
- **The frontend was not embedded in the executable.** `Cargo.toml` never
  declared the `custom-protocol` feature that Tauri gates asset embedding
  behind, so a release build fell back to looking for a dev server on `devUrl`
  and would have opened a blank window. Found by grepping the compiled binary
  for the asset keys: 0 of 18 were present. Now `default = ["custom-protocol"]`
  and `scripts/verify-exe.py` fails the build if any asset is missing.
- **The executable depended on the Visual C++ Redistributable.** It imported
  `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll`, so the "portable" build would
  not have started on a clean Windows install. Now linked with
  `-C target-feature=+crt-static`; the binary imports only system DLLs.
- **`webview2.rs` compared `u32` to `i32`.** `windows-sys` 0.59 returns
  `WIN32_ERROR` (`u32`) from the registry functions, not `i32`. Four type
  errors, caught the first time the Rust actually reached the compiler.

### Build
- `scripts/build-windows-cross.sh` — cross-compiles `B mark.exe` from Linux or
  macOS with cargo-xwin, targeting real MSVC rather than MinGW.
- `scripts/verify-exe.py` — post-build verification of the PE: subsystem,
  icon, version resource, manifest, embedded frontend, and runtime imports.
- `installer/b-mark.nsi` and `scripts/build-installer.sh` — a hand-written
  per-user NSIS installer. `RequestExecutionLevel user`, installs to
  `%LOCALAPPDATA%\Programs`, writes only to HKCU, registers the six Markdown
  extensions via `OpenWithProgids` and `RegisteredApplications`, and uninstalls
  cleanly. Verified end to end under Wine: silent install, registry contents,
  then silent uninstall leaving no files and no leftover keys.
- Static CRT moved from an environment variable into
  `src-tauri/.cargo/config.toml`, so it applies no matter which tool invokes
  cargo.

### Fixed
- **The installer hung on `setup.exe /S`.** The WebView2 warning used a
  `MessageBox` with no `/SD` silent default, so an unattended install waited
  forever for an answer nobody could give. A missing runtime is a warning, not
  a reason to refuse to install, so it now defaults to continuing.

### Known limitations
- The Windows executable has been built and confirmed to run, but only under
  Wine, where it correctly reaches the "WebView2 Runtime is required" path
  because Wine has no WebView2. The application's own window has therefore
  never been rendered on a real Windows machine. Everything inside that window
  is the frontend, which is covered by 209 tests and verified in a headless
  browser against the production build.
- Saving is unavailable in the browser build, which reports that honestly
  rather than failing at the moment you press Ctrl+S.
- Scroll sync between the editor and preview is proportional, not
  line-accurate. Line accuracy would need source maps threaded through
  markdown-it, sanitisation and the DOM.
- Releases are not code-signed. See SECURITY.md.

## Authorship

B mark was built by **Masoud Borodayeh** with help from Arena. It cost nothing
to make, so it is released free of charge under the MIT licence.
