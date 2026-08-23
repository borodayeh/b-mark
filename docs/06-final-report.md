# گزارش نهایی — B mark

وضعیت: **۲۰۹ تست پاس · TypeScript strict تمیز · صفر خطای کنسول · ۱۲ از ۱۳ فاز کامل**

---

## فناوری انتخاب‌شده

**Tauri 2 + Rust + TypeScript خالص + Vite** — بدون React/Vue/Svelte.

بزرگ‌ترین ریسک پروژه، shaping و الگوریتم دوجهتهٔ فارسی بود. موتور WebView2
هر دو را بومی و بی‌نقص دارد؛ پیاده‌سازی همین در WPF یا Avalonia هفته‌ها کار
دستی و پرباگ است. در عوض حجم و حافظه هم به Electron باج داده نمی‌شود.

## ساختار پروژه

```
b-mark/
├─ src/
│  ├─ direction/     ⭐ موتور جهت per-block
│  ├─ markdown/      رندر، پاک‌سازی، برجسته‌سازی
│  ├─ settings/      schema، store، پنل
│  ├─ platform/      انتزاع میزبان (Tauri | مرورگر)
│  ├─ editor/        ویرایشگر دوستونی
│  ├─ i18n/          fa.json + en.json
│  ├─ components/    لوگو، منوی راست‌کلیک
│  └─ styles/        fonts، theme، content، app
├─ src-tauri/        files، settings، watcher، webview2 + capabilities
├─ tests/            ۸ فایل، ۲۰۹ تست
├─ assets/           branding (وکتور + ۱۳ PNG + ICO)، fonts، screenshots
├─ docs/             ۶ گزارش + مجوزها + مراجع بایگانی‌شده
└─ scripts/          build-portable.ps1، generate-branding.py
```

## دستورات

```bash
npm ci
npm run dev            # مرورگر، بدون نیاز به Rust
npm run tauri:dev      # پنجرهٔ واقعی دسکتاپ (ویندوز)
npm test               # ۲۰۹ تست
npm run typecheck
```

```powershell
.\scripts\build-portable.ps1          # release/B mark.exe + SHA256SUMS.txt
.\scripts\build-portable.ps1 -Arch arm64
npm run tauri -- build --bundles nsis # نصب‌کنندهٔ تک‌کاربره
```

**مسیر خروجی:** `release/B mark.exe`

---

## ۸ باگ واقعی که در حین ساخت کشف و رفع شد

| # | باگ | چطور پیدا شد |
|---|---|---|
| ۱ | `USE_PROFILES` در DOMPurify روی `ALLOWED_TAGS` غلبه می‌کرد و allowlist را بی‌اثر می‌کرد — **نقص امنیتی** | تست |
| ۲ | ارقام فارسی/عربی (U+06F0–06F9، U+0660–0669) به‌عنوان نویسهٔ قوی RTL شمرده می‌شدند | تست |
| ۳ | `blockquote` همیشه LTR می‌شد چون متن مستقیم ندارد | تست |
| ۴ | آیتم عددی بین دو آیتم فارسی LTR می‌شد | تست |
| ۵ | فارسی داخل بلوک کد از هم می‌پاشید (مونواسپیس بدون shaping عربی) | بازرسی چشمی |
| ۶ | نوار ابزار زیر ۵۰۰px کلیپ می‌شد و دکمه‌ها ناپدید می‌شدند | تست پیکسلی |
| ۷ | **مسیر ویندوز در پیام خطا سر دو نقطهٔ درایو بریده می‌شد** — به کاربر می‌گفت فایل مزاحم «C» نام دارد | تست |
| ۸ | `document.execCommand` بدون feature-detect صدا زده می‌شد | تست |

---

## سه تصمیمی که ارزش توضیح دارند

**۱. `dir="auto"` کافی نیست.** روش استاندارد مرورگر، جهت را از *اولین نویسهٔ
قوی* می‌گیرد. جملهٔ «`npm install` را در ترمینال اجرا کنید.» با آن چپ‌چین
می‌شود. B mark ابتدا کد، URL، مسیر ویندوز و ایمیل را حذف می‌کند، بعد
نویسه‌های قوی باقی‌مانده را **وزن‌دهی** می‌کند، و بلوک‌های خنثی از همسایه
ارث می‌برند. کد MarkText در `docs/references/` بایگانی شده تا این تفاوت
قابل ردیابی باشد.

**۲. زبان رابط هرگز جهت سند را تعیین نمی‌کند.** با رابط کاملاً فارسی،
پاراگراف انگلیسی همچنان چپ‌چین می‌ماند — تأییدشده:
`['rtl','rtl','rtl','ltr','rtl','rtl']`.

**۳. میزبان مرورگر صادقانه تخریب می‌شود.** به‌جای دکمه‌ای که بی‌صدا هیچ
کاری نمی‌کند، `canSave: false` گزارش می‌دهد و رابط دکمه را غیرفعال می‌کند.

---

## محدودیت‌هایی که پنهان نمی‌کنیم

1. **پنجرهٔ خود برنامه روی ویندوز واقعی دیده نشده.** فایل اجرایی ساخته شد و
   اجرا شد، اما فقط زیر Wine، جایی که به‌درستی به مسیر «WebView2 لازم است»
   می‌رسد چون Wine اصلاً WebView2 ندارد. هر چه داخل آن پنجره است فرانت‌اند
   است که با ۲۰۹ تست و تأیید headless روی بیلد production پوشش دارد — اما
   ترکیب این دو تا وقتی روی یک ویندوز واقعی اجرا نشود تأیید نشده است.
2. **EXE تک‌فایله است اما بدون‌وابستگی نیست** — به WebView2 Runtime نیاز
   دارد که بخشی از ویندوز ۱۱ و ویندوز ۱۰ به‌روز است. در نبود آن پیام بومی
   دوزبانه نمایش داده می‌شود. **هیچ دانلود مخفیانه‌ای انجام نمی‌شود.**
3. **فایل‌ها امضای دیجیتال ندارند.** ممکن است SmartScreen هشدار دهد.
   **تضمین نمی‌کنیم هیچ آنتی‌ویروسی هرگز آن را علامت نزند** — هیچ‌کس
   نمی‌تواند. کاری که کردیم: کد شفاف بدون obfuscation، بدون اجرای shell،
   بدون شبکه، متادیتای کامل، و انتشار SHA-256.
4. **همگام‌سازی اسکرول نسبی است، نه خط‌به‌خط.**

---

## اعداد نهایی

| معیار | مقدار |
|---|---|
| تست | **۲۰۹ پاس / ۰ ناموفق** |
| باگ واقعی کشف‌شده | **۱۲** |
| JS نهایی | ۳۴۹ KB (gzip ۱۲۹ KB) |
| CSS نهایی | ۲۲ KB (gzip ۵ KB) |
| فونت | ۵۹۲ KB (۹ وزن + variable) |
| IoU وکتور لوگو | ۰.۹۹۵۶ |
| سرریز افقی | صفر در ۳۶۰ / ۴۳۰ / ۶۰۰ / ۱۲۸۰ px |
| وابستگی runtime | ۵ (markdown-it، DOMPurify، highlight.js + ۲ پلاگین) |

## ✅ فایل اجرایی ساخته شد

با وجود اینکه این محیط لینوکسی است، `B mark.exe` **واقعاً کامپایل شد** —
با `cargo-xwin`، که هدرها و کتابخانه‌های واقعی MSVC را از CDN مایکروسافت
می‌گیرد و با `clang-cl`/`lld-link` لینک می‌کند. خروجی یک PE با هدف
`x86_64-pc-windows-msvc` است، نه MinGW.

**دو خروجی:**

| فایل | حجم | توضیح |
|---|---|---|
| `release/B mark.exe` | ۴.۰۷ MB | Portable — بدون نصب |
| `release/B mark 0.1.0 setup.exe` | ۲.۰ MB | نصب‌کنندهٔ تک‌کاربره، دوزبانه |

**SHA-256:** `15baba1192f084ac135f3beefead7707c2f0e2f161d65a8364cd67676a0b4866`

### اعتبارسنجی (`scripts/verify-exe.py`)

```
PE32+ executable                              PASS
x86-64 machine type                           PASS  0x8664
Windows GUI subsystem (no console window)     PASS
application icon embedded                     PASS  7 sizes
version resource / manifest                   PASS
ProductName / CompanyName / Copyright         PASS
all frontend assets embedded                  PASS  18/18
Vazirmatn shipped inside the exe              PASS  10 weights
no Visual C++ Redistributable dependency      PASS
no unexpected DLL imports                     PASS  13 system DLLs
```

### نصب‌کننده — تست کامل زیر Wine

اسکریپت NSIS دست‌نویس است نه تولیدشده، تا هر نوشتنی که در رجیستری می‌کند در
یک فایل قابل بازبینی باشد (`installer/b-mark.nsi`).

```
نصب سایلنت                                       rc=0
C:\Users\<user>\AppData\Local\Programs\B mark\B mark.exe      ✓
میانبر منوی استارت + میانبر حذف نصب               ✓
HKCU\Software\Classes\BMark.Markdown             ✓
  shell\open\command = "...\B mark.exe" "%1"      ✓
HKCU\...\.md\OpenWithProgids  (۶ پسوند)         ✓
HKCU\...\Applications\B mark.exe                 ✓
HKCU\Software\RegisteredApplications             ✓
Add/Remove Programs                               ✓
حذف نصب سایلنت                                    rc=0
  فایل باقی‌مانده: هیچ · کلید رجیستری باقی‌مانده: هیچ
```

هیچ‌جا `HKLM` نوشته نشد و هیچ درخواست Administrator نبود.

**دربارهٔ پیش‌فرض شدن:** از ویندوز ۸ به بعد نصب‌کننده نمی‌تواند بی‌سروصدا
خودش را پیش‌فرض یک پسوند کند — مایکروسافت این تصمیم را عمداً به کاربر سپرده.
پس B mark در «Open with» و «Default apps» ظاهر می‌شود و اولین بار ویندوز
می‌پرسد؛ با تیک «Always use this app» از آن به بعد خودکار باز می‌شود. هر
راه‌حلی که ادعا کند این را دور می‌زند، یا کار نمی‌کند یا رفتار بدافزار دارد.

### اجرای واقعی

فایل زیر Wine اجرا شد و **پنجرهٔ واقعی ساخت**. چون Wine اصلاً WebView2 ندارد،
مسیر تشخیص ما فعال شد و پیام دوزبانه نمایش داده شد — دقیقاً همان رفتاری که
باید. تصویر: `docs/wine-run-check.png`.

نیمهٔ فارسی پیام در Wine به‌صورت مربع دیده می‌شود چون آن prefix خالی هیچ فونتی
با پوشش عربی ندارد؛ روی ویندوز `MessageBoxW` از Segoe UI استفاده می‌کند که
دارد. برای اطمینان، رشتهٔ فارسی مستقیماً از داخل باینری خوانده و تأیید شد:

```
به WebView2 Runtime نیاز است
```

### چهار باگ که فقط با کامپایل و نصب واقعی پیدا شدند

| # | باگ | اثر |
|---|---|---|
| ۹ | `custom-protocol` در `Cargo.toml` تعریف نشده بود | **فرانت‌اند اصلاً داخل exe نبود** — ۰ از ۱۸ asset. برنامه پنجرهٔ سفید باز می‌کرد |
| ۱۰ | CRT به‌صورت پویا لینک می‌شد | وابستگی به `VCRUNTIME140.dll` — روی ویندوز تازه‌نصب اجرا نمی‌شد |
| ۱۱ | `webview2.rs` مقایسهٔ `u32` با `i32` | ۴ خطای کامپایل؛ `windows-sys 0.59` نوع `WIN32_ERROR` برمی‌گرداند |

| ۱۲ | `MessageBox` نصب‌کننده بدون `/SD` | نصب سایلنت `setup.exe /S` برای همیشه منتظر پاسخی می‌ماند که کسی نمی‌توانست بدهد |

باگ ۹ از همه مهم‌تر بود: بدون آن، برنامه بدون هیچ خطایی بیلد می‌شد و فقط یک
پنجرهٔ خالی نشان می‌داد.

---

## گام بعدی برای تو

```bash
git init && git add . && git commit -m "B mark 0.1.0"
git remote add origin https://github.com/<you>/b-mark.git
git push -u origin main
git tag v0.1.0 && git push --tags
```

تگ زدن، workflow را اجرا می‌کند: تست روی لینوکس، سپس بیلد x64 و ARM64 روی
ویندوز، ساخت NSIS، و انتشار Release با SHA-256. `B mark.exe` از صفحهٔ
Releases قابل دانلود خواهد بود.

**قبل از پوش:** در هر دو README و در `src-tauri/Cargo.toml`، `borodayeh` را با
نام کاربری گیت‌هاب خودت جایگزین کن.
