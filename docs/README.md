# docs · مستندات

Development notes and reports kept for the record. The documents users and
contributors actually need are in the repository root.

یادداشت‌ها و گزارش‌های توسعه که برای ثبت تاریخچه نگه داشته شده‌اند. آنچه کاربر
و مشارکت‌کننده واقعاً لازم دارند در ریشهٔ مخزن است.

## Start here · از اینجا شروع کنید

| Document | فارسی | What it is |
|---|---|---|
| [README.md](../README.md) | [README.fa.md](../README.fa.md) | What B mark is, how to install it, keyboard shortcuts |
| [BUILD.md](../BUILD.md) | [BUILD.fa.md](../BUILD.fa.md) | Building from source, including cross-compiling from Linux |
| [SECURITY.md](../SECURITY.md) | [SECURITY.fa.md](../SECURITY.fa.md) | What the app does and does not do, and how to verify it |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | [CONTRIBUTING.fa.md](../CONTRIBUTING.fa.md) | How to work on it |
| [RELEASING.md](../RELEASING.md) | همان فایل، دوزبانه | Cutting a release |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | همان فایل، دوزبانه | Ground rules |
| [THIRD-PARTY.md](../THIRD-PARTY.md) | همان فایل، دوزبانه | Every dependency, its licence, and what was deliberately declined |
| [CHANGELOG.md](../CHANGELOG.md) | — | Every change, including every bug found and why it happened |

## Development record · سوابق توسعه

These are working documents from the build. They are historical: where they
disagree with the root documents, the root documents are right.

اینها اسناد کاریِ دورهٔ ساخت‌اند و تاریخی محسوب می‌شوند؛ هرجا با مستندات ریشه
اختلاف داشتند، مستندات ریشه درست‌اند.

| File | Contents |
|---|---|
| `00-research.md` | Survey of existing Markdown viewers and why none handled mixed Persian/English correctly |
| `01-phases.md` | The plan the work followed |
| `02-phase-1-3-report.md` | Direction engine, Markdown pipeline, themes |
| `03-phase-4-10-report.md` | Desktop shell, editor, exports |
| `04-phase-6-9-report.md` | Branding, installer, packaging |
| `05-acceptance-checklist.md` | The acceptance criteria, checked off with evidence |
| `06-final-report.md` | Summary, measurements, and the list of known limitations |

## Publishing · انتشار

- [`github-listing.md`](github-listing.md) — copy-paste text for the
  repository About box, topics, settings to enable, and the first pinned
  issue. متن‌های آمادهٔ صفحهٔ گیت‌هاب.
- [`../RELEASING.md`](../RELEASING.md) — the release procedure itself.

## Other · بقیه

- `licenses/` — full licence text of every bundled dependency
- `references/` — archived copies of the exact third-party files that were
  read for design reference, so the "studied, not copied" claim in
  THIRD-PARTY.md can be checked
- `installer-lang.png`, `wine-run-check.png` — evidence screenshots from
  testing the installer under Wine
