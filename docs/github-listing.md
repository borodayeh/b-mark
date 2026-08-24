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

**Do not add `wysiwyg` or `rich-text-editor`.** B mark has neither, and both
are explicitly out of scope in `.github/ISSUE_TEMPLATE/feature_request.yml`.
A topic that promises a feature the app does not have brings people who will
be disappointed, and it reads as a false claim in a repository whose selling
point is that it does not make false claims.

## 3b. Where the topics actually go

Repository page ▸ the ⚙ next to **About** in the right-hand column ▸ the
**Topics** field. Type each one and press Enter. The same dialog holds the
description, the website, and the checkboxes that control which panels appear
in that column — including **Packages**.

## 4. Repository settings to turn on

| Setting | Where | Why |
|---|---|---|
| Issues | Settings ▸ General ▸ Features | the issue templates in `.github/ISSUE_TEMPLATE/` need it |
| Discussions | Settings ▸ General ▸ Features | `.github/ISSUE_TEMPLATE/config.yml` links to it |
| Private vulnerability reporting | Settings ▸ Security | `SECURITY.md` and the Code of Conduct link to it |
| Releases | automatic | where the `.exe` files go |

The **Packages** panel is for the npm, Container and NuGet registries. B mark
is a desktop application, not a package: it will always say "No packages
published". Untick **Packages** in the About ⚙ dialog and the panel
disappears.

### Branch protection — the exact ruleset

GitHub nags that `main` is unprotected. On a single-maintainer repository this
is a suggestion, not a defect: it means only that nothing stops a force-push
or an accidental deletion. Dismissing it is a legitimate choice.

If you do want it — Settings ▸ Rules ▸ Rulesets ▸ New branch ruleset:

| Field | Value |
|---|---|
| Ruleset name | `main protection` |
| Enforcement status | **Active** (Evaluate only logs; Disabled does nothing) |
| Bypass list | **leave empty** |
| Target branches | Add target ▸ **Include default branch** |

Bypass empty is deliberate. Adding yourself would exempt you from the two
rules below, and you are the only person who could ever trigger them — the
protection would be decorative.

Tick exactly two rules:

| Rule | |
|---|---|
| **Restrict deletions** | ✅ nobody can delete `main`, including you by accident |
| **Block force pushes** | ✅ history cannot be rewritten out from under a clone |

Leave every other rule off, and here is why each one would hurt right now:

| Rule | Why not |
|---|---|
| Restrict creations | Only governs *creating* `main`, which already exists. No effect |
| **Restrict updates** | Would block your own pushes to `main`. This is the one that locks you out |
| Require linear history | Only meaningful once merge commits exist. Nothing to protect yet |
| Require deployments to succeed | No environments are configured |
| Require signed commits | Every push without a GPG or SSH signing key set up is rejected. Turn on only after signing works locally |
| Require a pull request before merging | You would have to open a pull request to yourself for every change. Turn on when a second contributor appears |
| Require status checks to pass | Reads well, but the fine print is "commits must first be pushed to another ref where the checks pass" — with no PR flow that forbids pushing to `main` at all. Enable it together with the PR rule, not before |
| Require code scanning results | CodeQL is not enabled; the rule would block on results that never arrive |
| Require code quality results | Same |
| Restrict code coverage | No coverage is uploaded by the workflow |
| Automatically request Copilot code review | A paid quota consumed on your own commits, on a repository with no reviewers |

Tags are unaffected: a ruleset targeting branches does not touch `refs/tags`,
so `git push origin v0.1.2` still works.

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
