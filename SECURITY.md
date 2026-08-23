[فارسی](SECURITY.fa.md)

# Security

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's
private [security advisory](../../security/advisories/new) form instead. We aim
to acknowledge within 72 hours.

---

## What B mark does and does not do

This section exists so you can verify our claims against the source rather
than take our word for it. File references are to this repository.

| Claim | Where to check |
|---|---|
| No network access at all | There is no HTTP client in `src-tauri/Cargo.toml`, and the CSP in `src-tauri/tauri.conf.json` has no remote origin in any directive |
| No telemetry or analytics | No such dependency exists; grep the tree |
| No hidden process spawning | No `std::process::Command`, no `cmd.exe`, no PowerShell. `reveal_in_explorer` in `src-tauri/src/files.rs` uses the opener plugin precisely to avoid spawning a shell |
| No obfuscation or packing | `[profile.release]` in `src-tauri/Cargo.toml` sets `lto`, `strip` and `opt-level = "s"` — ordinary optimisation, nothing more |
| File access is user-initiated only | `read_markdown_file` refuses any path whose extension is not in `MARKDOWN_EXTS`; `list_folder` runs only on a directory you picked yourself; every write goes through an extension allow-list |
| Settings stay per-user | `src-tauri/src/settings.rs` writes only to the OS config dir (`%AppData%\app.bmark.viewer`) |
| No JavaScript from documents ever executes | `html: false` by default in `src/markdown/renderer.ts`; DOMPurify allowlist in `src/markdown/sanitize.ts`; `script-src 'self'` in the CSP |

### Defence in depth against document content

A Markdown file is untrusted input. Three independent layers apply:

1. **Parser.** `markdown-it` runs with `html: false`, so raw HTML in a
   document is escaped to text rather than parsed.
2. **Sanitiser.** Even so, output passes through DOMPurify with an explicit
   tag and attribute allowlist. `<script>`, `<style>`, `<iframe>`, `<object>`,
   `<embed>`, `<form>` and `<base>` are forbidden; `style`, `srcset`, `ping`,
   `formaction` and every `on*` attribute are stripped; `javascript:`,
   `vbscript:` and `data:` URLs are removed from `href` and `src`.
3. **CSP.** `script-src 'self'`, `object-src 'none'`, `frame-src 'none'`,
   `base-uri 'none'`. No remote origin is reachable.

> A real bug was caught here during development: DOMPurify's `USE_PROFILES`
> option **overrides** an explicit `ALLOWED_TAGS` list, which silently
> re-admitted the entire HTML profile. It is gone, and
> `tests/markdown.spec.ts` now fails if it comes back.

### Links and images

Links never navigate the webview. The renderer moves the real target to a
`data-external` attribute and sets `href="#"`, so even a failure in the click
handler cannot cause navigation. External links are handed to the OS default
browser only on an explicit user action.

Remote images are held behind `data-src` and are not fetched until the user
allows them in Settings.

### Spell checking is offline

The Hunspell dictionaries are bundled inside the executable. Enabling the
checker loads them from the app's own asset protocol; no text ever leaves the
machine and no dictionary is downloaded.

---

## Code signing and antivirus false positives

**Releases are currently not code-signed.** We do not have an Authenticode
certificate. We will not pretend otherwise, and no build script writes a
signature it did not create — `scripts/build-portable.ps1` prints an explicit
warning when it produces an unsigned binary.

Consequences you should expect:

- Windows SmartScreen may show a "Windows protected your PC" prompt on first
  run of a new release, until the file accumulates reputation.
- Some antivirus engines apply heuristics to unsigned, low-prevalence
  executables. A fresh release may be flagged by one or two engines on
  VirusTotal even though nothing is wrong with it.

**We cannot guarantee that B mark will never be flagged by any antivirus
product, and we make no such claim.** Nobody can. What we can do is reduce the
likelihood by behaving like an ordinary, transparent desktop application:

- open, auditable source with no obfuscation or packing
- no shell invocation, no dynamic code loading, no unknown DLLs
- a standard Windows manifest and populated version/company/product metadata
- reproducible dependency versions (`package-lock.json`, `Cargo.lock`)
- SHA-256 checksums published with every release

We will never suggest, document, or implement a technique whose purpose is to
evade Windows Defender or any antivirus product. If a heuristic flags us, the
correct response is a false-positive report to the vendor, not evasion.

### Verifying a download

```powershell
Get-FileHash "B mark.exe" -Algorithm SHA256
```

Compare the result with `SHA256SUMS.txt` on the release page. You are also
welcome to upload the file to [VirusTotal](https://www.virustotal.com/) — and
to tell us what you find.

### When signing becomes available

If we obtain a certificate, `scripts/build-portable.ps1 -Sign <path.pfx>` will
sign and RFC-3161 timestamp the executable, the release notes will say so, and
this document will be updated. Until then, assume unsigned.

---

## Supported versions

Pre-1.0. Only the latest release receives fixes.

---

## Permissions the desktop build requests

Tauri 2 denies everything by default; `src-tauri/capabilities/default.json` is
the complete list of what B mark asks for. Every entry is justified here.

| Permission | Why |
|---|---|
| `core:default` | Tauri's own baseline IPC |
| `core:event:allow-listen` / `allow-unlisten` | receiving `b-mark://open-files` and `b-mark://file-changed` |
| `core:window:allow-set-fullscreen` / `allow-is-fullscreen` | F11 |
| `core:window:allow-set-title` / `allow-start-dragging` | title bar |
| `dialog:allow-open` | the Open File picker |
| `dialog:allow-save` | the Save dialog used by "Save as HTML" and "Save as Word". Nothing is written until you pick a location; `write_export_file` in `src-tauri/src/files.rs` additionally refuses any extension outside `html`, `htm`, `docx`, `md` |
| `opener:allow-open-url` (`http`, `https`, `mailto` only) | opening a link in your browser. Other schemes cannot be launched |
| `opener:allow-open-path` | "Open containing folder" |
| `updater:default`, `process:allow-restart` | the manual "Check for updates" button. There is no timer: nothing is fetched unless you click it |

**`tauri-plugin-fs` is deliberately not used.** All file access goes through
our own commands in `src-tauri/src/files.rs`, which enforce an extension
allowlist and a 32 MiB size cap. The general-purpose fs plugin would grant the
frontend far broader disk access than a Markdown viewer needs.

## WebView2 detection

`src-tauri/src/webview2.rs` reads two registry values to decide whether the
runtime is present, and shows a native message box if it is not. It reads the
registry; it never writes to it, and it never downloads or installs anything.
Silent runtime fetching is one of the behaviours that most reliably gets an
application flagged, and users are entitled to install their own system
components.
