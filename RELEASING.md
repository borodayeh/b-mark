<div align="right">

# راهنمای انتشار

## ۰. اولین پوش به گیت‌هاب

مخزن به‌صورت محلی ساخته شده، کامیت اول زده شده و تگ `v0.1.0` هم خورده است.
فقط کافی است در گیت‌هاب یک مخزن **خالی** به نام `b-mark` بسازید (بدون README،
بدون .gitignore، بدون LICENSE) و بعد:

```bash
cd b-mark
git remote add origin https://github.com/borodayeh/b-mark.git
git push -u origin main
```

تگ را عمداً جدا نگه دارید: به‌محض پوش شدنِ تگ، ورک‌فلو شروع به ساخت و انتشار
می‌کند. وقتی آماده بودید:

```bash
git push origin v0.1.0
```

بعد از اولین پوش، در تنظیمات مخزن این‌ها را روشن کنید: Issues، Discussions،
و در بخش Security گزینهٔ Private vulnerability reporting (لینک‌های `SECURITY.md`
و منشور رفتار به آن اشاره می‌کنند).

## ۱. آماده‌سازی

```bash
npm ci
npm run typecheck
npm test                 # ۳۹۸ تست
python3 scripts/generate-branding.py   # آیکن‌ها را از SVG اصلی بازمی‌سازد
git diff --exit-code -- src-tauri/icons assets/branding/png   # نباید تغییری باشد
```

شمارهٔ نسخه در سه جا باید یکی باشد:

| جا | کلید |
|---|---|
| `package.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |
| `src-tauri/tauri.conf.json` | `version` |

`CHANGELOG.md` را به‌روز کنید.

## ۲. ساخت باینری‌ها

دو راه دارید — **فقط یکی را انتخاب کنید**، وگرنه دو فایل متفاوت با یک نام
منتشر می‌شود:

**الف) روی گیت‌هاب (توصیه‌شده).** کافی است تگ `v*` را پوش کنید؛ ورک‌فلو
`build-windows.yml` روی ویندوز واقعی x64 و ARM64 می‌سازد، `verify-exe.py` را
اجرا می‌کند، نصب‌کننده را با NSIS می‌سازد و همه را با چک‌سام به Release می‌چسباند.

**ب) به‌صورت محلی.** طبق `BUILD.md` بسازید (روی ویندوز `scripts/build-portable.ps1`،
یا کراس‌کامپایل با `scripts/build-windows-cross.sh`)، سپس دو فایل زیر را در
`dist-release/v<version>/` بگذارید:

```
dist-release/v0.1.0/B mark.exe
dist-release/v0.1.0/B mark 0.1.0 setup.exe
```

و اجرا کنید — **از ریشهٔ پروژه**، نه از داخل پوشهٔ `dist-release`:

```powershell
.\scripts\prepare-release.ps1 0.1.2      # ویندوز
```

```bash
bash scripts/prepare-release.sh 0.1.2     # لینوکس یا مک
```

اسکریپت `.sh` روی ویندوز به WSL یا Git Bash نیاز دارد؛ نسخهٔ `.ps1` ندارد.
اگر PowerShell گفت `running scripts is disabled`، یک بار با
`powershell -ExecutionPolicy Bypass -File .\scripts\prepare-release.ps1 0.1.2`
اجرایش کنید.

این اسکریپت فایل‌ها را اعتبارسنجی می‌کند، `SHA256SUMS.txt` و
`RELEASE-NOTES.md` دوزبانه می‌سازد و دستور `gh release create` را چاپ می‌کند.

## ۳. تگ و انتشار

```bash
git commit -am "release: v0.1.0"
git tag -a v0.1.0 -m "B mark 0.1.0"
git push origin main --tags
```

اگر راه «ب» را رفته‌اید و نمی‌خواهید ورک‌فلو هم فایل بچسباند، تگ را پوش نکنید و
مستقیم `gh release create` را اجرا کنید (دستور دقیقش را اسکریپت چاپ کرده).

## ۴. به‌روزرسانی خودکار (اختیاری)

آپدیتر به `https://github.com/borodayeh/b-mark/releases/latest/download/latest.json`
نگاه می‌کند. تا وقتی این فایل را در Release نگذارید، «بررسی به‌روزرسانی» به
نتیجه نمی‌رسد و پیام خطای بی‌ضرر می‌دهد — بقیهٔ برنامه اثری نمی‌گیرد.

برای فعال کردنش، `latest.json` را با کلید خصوصی امضا کنید:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat /path/to/updater-private.key)"
npx @tauri-apps/cli signer sign "dist-release/v0.1.0/B mark.exe"
```

خروجی `.sig` را داخل `latest.json` بگذارید:

```json
{
  "version": "0.1.0",
  "notes": "...",
  "pub_date": "2026-08-23T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<محتوای فایل .sig>",
      "url": "https://github.com/borodayeh/b-mark/releases/download/v0.1.0/B.mark.exe"
    }
  }
}
```

> **کلید خصوصی را هرگز کامیت نکنید.** `.gitignore` هر `*.key` را نادیده می‌گیرد.
> نسخهٔ پشتیبان بگیرید: اگر گم شود، هیچ نسخهٔ نصب‌شده‌ای دیگر آپدیت نمی‌گیرد.

## ۵. بعد از انتشار

- روی یک ویندوز تمیز، هر دو فایل را واقعاً اجرا کنید.
- چک‌سام‌های Release را با فایل‌های دانلودشده مقایسه کنید.
- اگر خواستید، فایل‌ها را در VirusTotal بگذارید و لینک نتیجه را در توضیح
  Release بیاورید — چون باینری‌ها امضای دیجیتال ندارند این کار اعتماد می‌سازد.

</div>

---

# Releasing

## 0. First push

The repository is already initialised locally, with an initial commit and a
`v0.1.0` tag. Create an **empty** `b-mark` repository on GitHub (no README, no
.gitignore, no licence), then:

```bash
git remote add origin https://github.com/borodayeh/b-mark.git
git push -u origin main
```

Push the tag separately, when you are ready — pushing it triggers the build
and publish workflow:

```bash
git push origin v0.1.0
```

Afterwards, enable Issues, Discussions and private vulnerability reporting in
the repository settings; `SECURITY.md` and the Code of Conduct link to them.

## 1. Prepare

```bash
npm ci
npm run typecheck
npm test
python3 scripts/generate-branding.py
git diff --exit-code -- src-tauri/icons assets/branding/png
```

The version must match in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`. Update `CHANGELOG.md`.

## 2. Build

Pick **one** route, not both, or you will publish two different files under
one name.

**a) On GitHub (recommended).** Push a `v*` tag; `build-windows.yml` builds
x64 and ARM64 on real Windows, runs `verify-exe.py`, builds the NSIS
installer and attaches everything with checksums.

**b) Locally.** Build per `BUILD.md`, drop the two executables into
`dist-release/v<version>/`, then run:

```powershell
.\scripts\prepare-release.ps1 0.1.2      # Windows, from the repository root
```

```bash
bash scripts/prepare-release.sh 0.1.2     # Linux or macOS
```

It validates the files, writes `SHA256SUMS.txt` and a bilingual
`RELEASE-NOTES.md`, and prints the `gh release create` command.

## 3. Tag and publish

```bash
git commit -am "release: v0.1.0"
git tag -a v0.1.0 -m "B mark 0.1.0"
git push origin main --tags
```

## 4. Auto-update (optional)

The updater polls
`https://github.com/borodayeh/b-mark/releases/latest/download/latest.json`.
Until that file exists, "check for updates" simply fails harmlessly.

Sign the binary and publish `latest.json` as shown in the Persian section
above. **Never commit the private key** — `.gitignore` excludes `*.key`, and
losing it means no installed copy can ever be updated again.

## 5. After publishing

Actually run both files on a clean Windows machine, verify the published
checksums against what you downloaded, and consider linking a VirusTotal
report — the binaries are unsigned, so that transparency helps.
