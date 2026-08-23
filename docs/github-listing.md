# GitHub listing · متن‌های آمادهٔ گیت‌هاب

Copy-paste text for the repository page. Keep this file in sync when the
description changes — the wording is duplicated in the README and in the app.

متن‌های آمادهٔ کپی برای صفحهٔ مخزن.

---

## 1. About · description

GitHub's **About** box (the ⚙ next to "About" on the repository page) allows
350 characters. Pick one.

**English** — 183 characters:

```
A fast, modern Markdown viewer and split editor for Windows — with Persian and RTL as a first-class feature, not an afterthought. Per-block direction detection. Offline, no telemetry.
```

**فارسی** — ۱۵۹ نویسه:

```
نمایشگر و ویرایشگر سریع و مدرن مارک‌داون برای ویندوز — با پشتیبانی درجه‌یک از فارسی و راست‌به‌چپ، نه به‌عنوان یک وصله. تشخیص جهت در سطح هر بلوک. کاملاً آفلاین.
```

**Bilingual** — 214 characters, and signals the project's nature at a
glance:

```
A fast, modern Markdown viewer for Windows with Persian/RTL as a first-class feature — per-block direction detection, offline, no telemetry. · نمایشگر مارک‌داون برای ویندوز با پشتیبانی درجه‌یک از فارسی و راست‌به‌چپ
```

## 2. Website

Leave empty until there is a real page, or point it at the latest release:

```
https://github.com/borodayeh/b-mark/releases/latest
```

Do not put a placeholder URL there. An About box linking to nothing looks
worse than an empty one.

## 3. Topics

GitHub allows up to 20. These are the ones people actually search:

```
markdown  markdown-viewer  markdown-editor  persian  farsi  rtl  bidi
bidirectional-text  tauri  tauri-app  windows  desktop-app  typescript
rust  offline  vazirmatn  unicode
```

`persian`, `farsi`, `rtl` and `bidi` are the ones that will bring the audience
this project was built for. Do not skip them.

## 4. Repository settings to turn on

| Setting | Where | Why |
|---|---|---|
| Issues | Settings ▸ General ▸ Features | the issue templates in `.github/ISSUE_TEMPLATE/` need it |
| Discussions | Settings ▸ General ▸ Features | `.github/ISSUE_TEMPLATE/config.yml` links to it |
| Private vulnerability reporting | Settings ▸ Security | `SECURITY.md` and the Code of Conduct link to it |
| Releases | automatic | where the `.exe` files go |

Turn **off** Wikis and Projects unless you intend to use them; an empty tab
invites the question "is this abandoned?".

## 5. Social preview image

Settings ▸ General ▸ Social preview. Use
`assets/branding/png/bmark-icon-512.png` on a dark plate, or a screenshot of
a Persian document — the second one explains the project faster than any
sentence. GitHub wants 1280×640.

## 6. Release description

Do not write it by hand. `scripts/prepare-release.sh <version>` generates
`dist-release/v<version>/RELEASE-NOTES.md` with the real SHA-256 of the files
you are about to upload, in both languages. Paste that, or pass it directly:

```bash
gh release create v0.1.2 \
  "dist-release/v0.1.2/B mark 0.1.2 Portable.exe" \
  "dist-release/v0.1.2/B mark 0.1.2 setup.exe" \
  "dist-release/v0.1.2/SHA256SUMS.txt" \
  --title "B mark 0.1.2" \
  --notes-file "dist-release/v0.1.2/RELEASE-NOTES.md"
```

## 7. The first pinned issue (optional, recommended)

An unsigned Windows binary always attracts the same question. Getting there
first is cheaper than answering it ten times:

> **Title:** SmartScreen warning and antivirus false positives — read this first
>
> B mark is not code-signed; we do not have an Authenticode certificate. See
> SECURITY.md for exactly what that means, what we do to reduce false
> positives, and how to verify a download against the published SHA-256.
> Reports of a specific engine flagging a specific version are welcome —
> please include the engine name and the file hash.
