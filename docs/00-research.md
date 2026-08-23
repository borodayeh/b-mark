# فاز ۰ — گزارش بررسی کد پروژه‌های مرجع

> تاریخ بررسی: ۲۰۲۶/۰۸/۲۲ · همه آمار مستقیم از GitHub API

## ۱. پروژه‌هایی که کدشان بررسی شد

| پروژه | ⭐ | License | آخرین کامیت | چه چیزی از آن گرفتیم |
|---|---|---|---|---|
| [marktext/marktext](https://github.com/marktext/marktext) | ۶۰٬۴۲۲ | MIT | 2026-07-27 | الگوی Toolbar، Empty State، ساختار تم‌ها، **درس منفی RTL** |
| [Zettlr/Zettlr](https://github.com/Zettlr/Zettlr) | ۱۳٬۴۲۰ | GPL-3.0 | 2026-08-18 | معماری Settings و i18n مبتنی بر JSON |
| [tauri-apps/tauri](https://github.com/tauri-apps/tauri) | ۱۱۰٬۴۵۱ | MIT/Apache-2.0 | 2026-08-21 | File Association + CLI args (مثال رسمی) |
| [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) | ۲۱٬۸۳۴ | MIT | 2026-08-13 | موتور رندر + Plugin API برای per-block dir |
| [cure53/DOMPurify](https://github.com/cure53/DOMPurify) | ۱۷٬۳۲۱ | Apache-2.0 / MPL-2.0 | 2026-08-21 | Sanitize کردن HTML خام |
| [highlightjs/highlight.js](https://github.com/highlightjs/highlight.js) | ۲۴٬۹۸۲ | BSD-3-Clause | 2026-08-21 | Syntax Highlighting آفلاین |
| [rastikerdar/vazirmatn](https://github.com/rastikerdar/vazirmatn) | ۳٬۱۶۵ | OFL-1.1 | v33.003 | فونت (۹ وزن + Variable) |

> ⚠️ نکته License: **هیچ خط کدی از این پروژه‌ها کپی نشده.** فقط الگوهای طراحی
> مطالعه شد و فایل‌های مرجع در `docs/references/` بایگانی شده‌اند تا مسیر
> مطالعه قابل ردیابی باشد. Zettlr چون GPL-3.0 است، حتی یک خط از آن هم
> کپی نمی‌شود (پروژه ما MIT خواهد بود).

---

## ۲. یافته کلیدی: هیچ‌کدام RTL درست ندارند

این مهم‌ترین نتیجه بررسی است.

### MarkText
فایل بررسی‌شده: `docs/references/marktext-printService.ts` و `...direction.spec.ts`

```ts
// marktext/packages/desktop/src/renderer/src/services/printService.ts
renderMarkdown(html: string, renderStatic?: boolean, dir?: string): void {
  ...
  if (dir === 'rtl' || dir === 'auto') {
    printContainer.setAttribute('dir', dir)
  }
```

**تحلیل:** MarkText جهت را فقط در **سطح کل سند** ست می‌کند و آن هم اخیراً
و فقط برای مسیر Print/PDF (issue #4833). یعنی در یک سند ترکیبی فارسی-انگلیسی،
یا همه چیز RTL می‌شود یا همه چیز LTR. حتی `dir="auto"` مرورگر هم فقط
اولین نویسه قوی *کل بلوک* را می‌بیند و برای مواردی مثل «پاراگرافی که با یک
لینک انگلیسی شروع می‌شود ولی بقیه‌اش فارسی است» **اشتباه** جواب می‌دهد.

### Zettlr
هیچ منطق direction اختصاصی ندارد؛ به رفتار پیش‌فرض CodeMirror تکیه می‌کند.

### نتیجه‌گیری برای B mark
این دقیقاً همان جایی است که پروژه ما باید متفاوت باشد:
**تشخیص جهت در سطح هر بلوک، با شمارش نویسه‌های قوی، نه فقط اولین نویسه.**

الگوریتم پیشنهادی (فاز ۳):

```
برای هر بلوک (p, li, td, th, blockquote, h1..h6, dd):
  strongRTL = تعداد نویسه‌های در بازه‌های عربی/فارسی/عبری
  strongLTR = تعداد نویسه‌های لاتین (خارج از code/URL)
  اگر strongRTL == 0 و strongLTR == 0  →  dir را از والد ارث ببر
  اگر strongRTL / (strongRTL+strongLTR) > 0.30  →  dir="rtl"
  در غیر این صورت → dir="ltr"
  همیشه: text-align را با dir هم‌راستا کن، اما
         عناصر <code>, <a href>, <kbd>, مسیر فایل را dir="ltr" و
         unicode-bidi: isolate کن
```

بازه‌های Unicode که باید پوشش داده شوند:
`U+0590–05FF` (عبری)، `U+0600–06FF` (عربی/فارسی)، `U+0750–077F`،
`U+08A0–08FF`، `U+FB1D–FDFF`، `U+FE70–FEFF`، `U+200F` (RLM)

نویسه‌های خنثی که نباید شمرده شوند: ارقام، فاصله، `U+200C` (نیم‌فاصله)،
علائم نگارشی مشترک.

---

## ۳. تصمیم فنی نهایی

### فناوری: **Tauri 2 + Rust + TypeScript + Vite** (بدون UI Framework سنگین)

| معیار | Tauri 2 | Electron | WinUI 3 | Avalonia |
|---|---|---|---|---|
| حجم EXE | **~۵–۱۰ MB** | ~۱۵۰ MB | ~۲۰ MB + WinAppSDK | ~۴۰ MB |
| RAM در حال کار | **~۸۰–۱۵۰ MB** | ~۳۰۰ MB | ~۱۰۰ MB | ~۱۲۰ MB |
| Runtime لازم | WebView2 | ندارد | Windows App SDK | ندارد |
| کیفیت رندر متن فارسی | **عالی** (موتور HarfBuzz مرورگر) | عالی | خوب | متوسط |
| پشتیبانی Bidi | **کامل و رایگان** (CSS `direction`/`unicode-bidi`) | کامل | دستی | ضعیف |
| Portable بدون Admin | ✅ | ✅ | ❌ سخت | ✅ |

**چرا Tauri برنده شد:** بزرگ‌ترین ریسک این پروژه رندر صحیح متن دوجهته
فارسی است. موتور WebView2 (Chromium) الگوریتم UBA و shaping فارسی را
به‌صورت بومی و بی‌نقص دارد. پیاده‌سازی همین در WPF/Avalonia هفته‌ها کار
دستی و پر از باگ است. در عوض حجم و RAM هم به Electron باج نمی‌دهیم.

**هزینه‌ای که می‌پردازیم (باید در README شفاف نوشته شود):**
- خروجی یک EXE واقعی و تک‌فایله است، **اما به WebView2 Runtime وابسته است.**
- WebView2 روی همه Windows 11 و اکثر Windows 10 به‌روز از قبل نصب است.
- اگر نصب نبود → پیام دوزبانه واضح + لینک دانلود رسمی مایکروسافت.
  **هیچ دانلود مخفیانه‌ای انجام نمی‌شود.**
- ادعای «کاملاً مستقل و بدون هیچ وابستگی» **نمی‌کنیم**.

### وابستگی‌های Frontend (قطعی‌شده)

| پکیج | نسخه | License | حجم unpacked |
|---|---|---|---|
| markdown-it | 15.0.0 | MIT | 1.9 MB |
| markdown-it-task-lists | 2.1.1 | ISC | 23 KB |
| markdown-it-anchor | 9.2.1 | Unlicense | 132 KB |
| dompurify | 3.4.14 | MPL-2.0 OR Apache-2.0 | 1.8 MB |
| highlight.js | 11.12.0 | BSD-3-Clause | 5.4 MB (فقط زبان‌های لازم bundle می‌شود) |

**عمداً استفاده نمی‌کنیم:** mermaid (۸۲ MB!)، katex (۳.۹ MB) — خارج از
اسکوپ Viewer هستند و حجم را نابود می‌کنند. اگر بعداً خواستی، به‌صورت
Lazy-load در فاز اختیاری اضافه می‌شوند.

**هیچ UI Framework** (React/Vue/Svelte) استفاده نمی‌شود — برنامه فقط چند
صفحه دارد و TypeScript خالص + Web Components کافی است. این باعث می‌شود
باندل نهایی زیر ۳۰۰ KB بماند.

---

## ۴. وضعیت محیط ساخت

| ابزار | وضعیت در این محیط |
|---|---|
| Node.js 20.20.2 | ✅ موجود |
| npm 10.8.2 | ✅ موجود |
| Rust / Cargo | ❌ **نصب نیست** |
| MSVC Toolchain (ویندوز) | ❌ در این Sandbox لینوکسی غیرممکن |

**پیامد مهم:** بخش Frontend را اینجا کامل می‌سازم و در مرورگر تست می‌کنم،
اما **کامپایل نهایی `B mark.exe` باید روی یک ماشین Windows انجام شود** یا
از طریق GitHub Actions با runner `windows-latest`. workflow آماده را
در فاز ۹ می‌نویسم تا فقط پوش کنی و EXE از Releases دانلود شود.

---

## ۵. فایل‌هایی که تا اینجا وارد پروژه شد

```
b-mark/
├─ assets/fonts/                    ← ۵۹۲ KB، از Release رسمی v33.003
│  ├─ Vazirmatn[wght].woff2         (Variable — همه وزن‌ها، ۱۱۱ KB)
│  ├─ Vazirmatn-Thin … Black.woff2  (۹ وزن استاتیک برای fallback)
│  └─ Vazirmatn-OFL.txt             (متن مجوز)
├─ docs/licenses/                   ← متن کامل مجوز همه وابستگی‌ها
│  ├─ markdown-it-LICENSE  (MIT)
│  ├─ dompurify-LICENSE    (Apache-2.0)
│  ├─ highlightjs-LICENSE  (BSD-3-Clause)
│  ├─ tauri-LICENSE-MIT / -APACHE-2.0
│  └─ vazirmatn-OFL.txt    (OFL-1.1)
└─ docs/references/                 ← فایل‌های مرجع مطالعه‌شده (کپی نشده در کد)
   ├─ marktext-printService.ts + .spec.ts + .css + LICENSE
   └─ tauri-file-assoc/             (مثال رسمی File Association تائوری)
```
