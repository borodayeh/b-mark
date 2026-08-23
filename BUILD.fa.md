<div align="right">

[English](BUILD.md)

# ساخت B mark

## پیش‌نیازها

| ابزار | نسخه | چرا |
|---|---|---|
| [Node.js](https://nodejs.org/) | ۲۰ LTS یا بالاتر | ساخت فرانت‌اند و تست‌ها |
| [Rust](https://rustup.rs/) | ۱٫۷۷ به بالا، زنجیرهٔ **MSVC** | پوستهٔ دسکتاپ |
| Visual Studio Build Tools | ۲۰۱۹ یا ۲۰۲۲، بستهٔ «Desktop development with C++» | لینکر MSVC که Rust لازم دارد |
| [Python](https://www.python.org/) | ۳٫۱۰ به بالا | فقط برای بازتولید آیکن‌ها از فایل‌های SVG |
| WebView2 Runtime | هر نسخهٔ به‌روز | برای **اجرای** نتیجه؛ روی ویندوز ۱۱ از پیش نصب است |

```powershell
rustup default stable-msvc
rustup target add x86_64-pc-windows-msvc
pip install cairosvg pillow
```

> **کل فرانت‌اند را می‌توانید روی لینوکس یا مک توسعه بدهید.** هر چه در `src/`
> است — خط لولهٔ مارک‌داون، موتور جهت، تم‌ها، فونت‌ها و هر ۴۲۴ تست — هرجا Node
> اجرا شود کار می‌کند. فقط فایل `.exe` نهایی به ویندوز نیاز دارد.

## توسعه

```bash
npm ci

npm run dev          # فقط فرانت‌اند، در مرورگر روی http://localhost:1420
npm run tauri:dev    # پنجرهٔ واقعی دسکتاپ (ویندوز، نیازمند Rust)

npm test             # ۴۲۴ تست واحد
npm run test:watch
npm run typecheck
```

`npm run dev` واقعاً به‌درد‌بخور است: باز کردن فایل در مرورگر به
`<input type="file">` و کشیدن‌و‌رهاکردن برمی‌گردد، پس موتور مارک‌داون و جهت را
می‌شود بدون هیچ زنجیرهٔ ابزار Rust آزمود.

## بیلد نهایی

### نسخهٔ پرتابل

```powershell
.\scripts\build-portable.ps1
```

اسکریپت زنجیرهٔ ابزار را بررسی می‌کند، وابستگی‌ها را نصب می‌کند، برندینگ را
بازتولید می‌کند، typecheck و تست‌ها را اجرا می‌کند، می‌سازد، و در پایان حجم و
SHA-256 را گزارش می‌دهد.

خروجی:

```
release/
├─ B mark.exe
└─ SHA256SUMS.txt
```

### نصب‌کنندهٔ تک‌کاربره

```bash
sudo apt install nsis          # یا روی ویندوز: choco install nsis
./scripts/build-installer.sh
```

خروجی: `release/B mark <نسخه> setup.exe`

اسکریپت فقط یک پوستهٔ نازک دور `makensis` و
[`installer/b-mark.nsi`](installer/b-mark.nsi) است، که **دستی نوشته شده، نه
تولیدشده توسط بسته‌بند Tauri**. دو دلیل:

۱. هر نوشتنی در رجیستری که نصب‌کننده انجام می‌دهد، در یک فایل قابل بازبینی
   دیده می‌شود. برای برنامه‌ای که در README ادعا می‌کند به HKLM دست نمی‌زند،
   این از راحتیِ اسکریپت تولیدشده مهم‌تر است.
۲. بسته‌بند NSIS تائوری فعلاً از طریق `cargo-xwin` روی لینوکس کار نمی‌کند —
   این دو سر نحوهٔ لینک CRT اختلاف دارند و بیلد موقع لینک شکست می‌خورد.
   صدا زدن مستقیم `makensis` این مشکل را کلاً دور می‌زند و روی ویندوز و
   لینوکس یکسان کار می‌کند.

چه چیزی تولید می‌کند:

| | |
|---|---|
| `RequestExecutionLevel user` | هرگز پنجرهٔ UAC نمی‌آید |
| `$LOCALAPPDATA\Programs\B mark` | محل نصب |
| فقط `HKCU` | ProgID و `OpenWithProgids` و `RegisteredApplications` و Add/Remove Programs |
| `Target amd64-unicode` | نصب‌کنندهٔ بومی ۶۴ بیتی، هماهنگ با خود برنامه |
| انگلیسی + فارسی | **هر بار** پرسیده می‌شود؛ انتخاب قبلی فقط پیش‌فرض را تعیین می‌کند |

وجود WebView2 Runtime را بررسی می‌کند و اگر نبود هشدار می‌دهد، ولی به هر حال
نصب را ادامه می‌دهد و **هرگز آن را دانلود نمی‌کند** — به SECURITY.fa.md
مراجعه کنید.

آزمودنش بدون نصب روی دستگاه خودتان:

```bash
wine "release/B mark 0.1.2 setup.exe" /S     # نصب خاموش در یک wine prefix
```

### ARM64

```powershell
rustup target add aarch64-pc-windows-msvc
.\scripts\build-portable.ps1 -Arch arm64
```

ARM64 **آزمایشی** است. بیلد می‌شود و CI هم خروجی می‌دهد، ولی سخت‌افزار ARM64
برای آزمودنش نداریم، پس با همین توضیح منتشر می‌شود نه به‌عنوان یک هدف
پشتیبانی‌شده.

### کراس‌کامپایل از لینوکس یا مک

به دستگاه ویندوزی نیاز ندارید.

```bash
./scripts/build-windows-cross.sh
```

این از [cargo-xwin](https://github.com/rust-cross/cargo-xwin) استفاده می‌کند
که هدرها و کتابخانه‌های import و CRT خود مایکروسافت را از CDN عمومی‌شان
دانلود می‌کند و با `clang-cl` / `lld-link` لینک می‌کند. خروجی یک PE واقعی
`x86_64-pc-windows-msvc` است — نه بیلد MinGW — پس دقیقاً مثل نسخه‌ای رفتار
می‌کند که روی ویندوز ساخته شده باشد.

پیش‌نیاز اضافه: `clang` و `lld`.

```bash
sudo apt install clang lld llvm
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin --locked
```

> بستهٔ `llvm` برای `llvm-rc` (کامپایلر منابع) لازم است؛ بدون آن بیلد با خطای
> `NotAttempted("llvm-rc")` شکست می‌خورد.

دو تنظیمی که اسکریپت اعمال می‌کند و `cargo build` سادهْ نه، و فراموش‌کردن هر
کدام باینری **خراب** تولید می‌کند:

| تنظیم | چرا |
|---|---|
| `--features custom-protocol` (از طریق فیچر `default` کرِیت) | Tauri فرانت‌اند جاسازی‌شده را پشت این فیچر قرار داده. بدون آن، باینری release دنبال سرور توسعه روی `devUrl` می‌گردد و **پنجرهٔ سفید** باز می‌کند. |
| `-C target-feature=+crt-static` | وگرنه فایل اجرایی `VCRUNTIME140.dll` را وارد می‌کند و روی دستگاهی بدون Visual C++ Redistributable اجرا نمی‌شود — که کل هدف نسخهٔ پرتابل را از بین می‌برد. |

**حافظه.** LTO کامل با `codegen-units = 1` حدود ۴ گیگابایت لازم دارد. روی
دستگاه کوچک‌تر یا swap اضافه کنید یا از پروفایل کم‌حافظه استفاده کنید:

```bash
PROFILE=release-lowmem ./scripts/build-windows-cross.sh
```

پروفایل `release-lowmem` همه چیز را از `release` به ارث می‌برد ولی LTO را
خاموش می‌کند. نسخهٔ رسمی همیشه با پروفایل کامل `release` در CI ساخته می‌شود.

### بررسی نتیجه

```bash
pip install pefile
python scripts/verify-exe.py "release/B mark.exe"
```

چیزهایی را بررسی می‌کند که باینری را ظاهراً سالم ولی عملاً خراب می‌کنند:
پنجرهٔ کنسول در نسخهٔ release، نبودن آیکن یا منبع نسخه، جاسازی‌نشدن فرانت‌اند،
یا وابستگی پنهان به CRT.

### امضا

```powershell
.\scripts\build-portable.ps1 -Sign .\cert.pfx -SignPassword $env:CERT_PASS
```

به `signtool.exe` از Windows SDK نیاز دارد. بدون `-Sign` اسکریپت صریحاً هشدار
می‌دهد که باینری امضا نشده است. [SECURITY.fa.md](SECURITY.fa.md) را ببینید.

## دارایی‌های برند

فایل‌های برداری در `assets/branding/` منبع حقیقت‌اند. هر PNG و فایل چندرزولوشنی
`.ico` از روی آن‌ها تولید می‌شود:

```bash
python scripts/generate-branding.py
```

| فایل اصلی | کاربرد |
|---|---|
| `bmark-icon.svg` | پلاک آیکن برنامه در همهٔ اندازه‌ها، از ۱۶ تا ۵۱۲ پیکسل |
| `bmark-mark.svg` | نشان با پس‌زمینهٔ شفاف برای مستندات |
| `bmark-mono.svg` | نشان `currentColor` برای رابط کاربری |

اگر آیکن‌های کامیت‌شده با فایل‌های اصلی اختلاف پیدا کنند CI شکست می‌خورد، پس
بعد از ویرایش هر SVG اسکریپت را اجرا کنید.

## حجم مورد انتظار خروجی

| جزء | حجم |
|---|---|
| چانک اصلی JS | حدود ۴۴۰ کیلوبایت (KaTeX و Mermaid چانک‌های جدا و تنبل‌اند) |
| CSS | حدود ۳۴ کیلوبایت |
| وزیرمتن، ۹ وزن + متغیر | ۵۹۲ کیلوبایت |
| واژه‌نامه‌های Hunspell فارسی + انگلیسی | ۳٫۱ مگابایت |
| کل `dist/`، ۱۴۷ فایل | حدود ۹ مگابایت |
| **`B mark.exe`** | **حدود ۸٫۲ مگابایت** |

به‌علاوهٔ WebView2 Runtime که جزئی از ویندوز است و ما آن را نمی‌فرستیم.

## رفع اشکال

**`link.exe not found`** — بستهٔ «Desktop development with C++» را در
Visual Studio Build Tools نصب کنید و بعد ترمینال را ببندید و باز کنید.

**بعد از نصب rustup دستور `cargo` پیدا نمی‌شود** — یک ترمینال جدید باز کنید؛
مسیر `%USERPROFILE%\.cargo\bin` فقط برای نشست‌های جدید به PATH اضافه می‌شود.

**`python: command not found` در اسکریپت بیلد** — فقط برای بازتولید آیکن لازم
است. اگر آیکن‌های `src-tauri/icons/` به‌روزند این مرحله را رد کنید.

**پنجرهٔ سفید موقع اجرا** — WebView2 Runtime نصب نیست یا خراب است. از صفحهٔ
رسمی مایکروسافت نصبش کنید.

**حروف فارسی جدا از هم نمایش داده می‌شوند** — وزیرمتن بارگذاری نشده. در
`npm run dev` کنسول مرورگر را ببینید؛ قواعد `@font-face` در
`src/styles/fonts.css` باید به `assets/fonts/` برسند.

</div>
