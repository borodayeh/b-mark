# گزارش فازهای ۱ تا ۳

وضعیت: ✅ تکمیل · ۸۷ تست واحد پاس · TypeScript بدون خطا · Build موفق

---

## فاز ۱ — اسکلت پروژه

```
b-mark/
├─ index.html                    نقطه ورود + CSP سخت‌گیرانه
├─ package.json                  ۵ وابستگی runtime، بدون UI framework
├─ tsconfig.json                 strict + noUncheckedIndexedAccess
├─ vite.config.ts                port 1420، target chrome105 (WebView2)
├─ src/
│  ├─ main.ts                    shell قابل اجرا
│  ├─ components/logo.ts         ⏸ placeholder تا رسیدن لوگو
│  ├─ direction/                 ⭐ موتور جهت
│  ├─ markdown/                  موتور رندر
│  ├─ styles/                    fonts / theme / content / app
│  └─ types/shims.d.ts
├─ src-tauri/
│  ├─ Cargo.toml                 profile release: lto, strip, بدون obfuscation
│  ├─ tauri.conf.json            NSIS per-user، file association، CSP
│  └─ src/{main,files,settings,watcher}.rs
├─ tests/                        ۳ فایل تست + fixture فشار
├─ assets/fonts/                 Vazirmatn v33.003
└─ docs/                         research, phases, licenses, references
```

**نکات کلیدی لایه Rust (نوشته شد، کامپایل روی ویندوز/CI):**

| فایل | مسئولیت | تصمیم امنیتی |
|---|---|---|
| `main.rs` | راه‌اندازی، پردازش CLI args | فقط پسوندهای مجاز پذیرفته می‌شود؛ فلگ‌های ناشناس نادیده |
| `files.rs` | خواندن/نوشتن | سقف ۳۲ MB، decode با `from_utf8_lossy` (فارسی سالم می‌ماند)، حذف BOM |
| `settings.rs` | ذخیره تنظیمات | `%AppData%\app.bmark.viewer`، نوشتن atomic با tmp+rename |
| `watcher.rs` | Live reload | debounce 250ms، watch روی پوشه والد (چون ادیتورها فایل را rename می‌کنند) |

`reveal_in_explorer` عمداً از **opener plugin** استفاده می‌کند نه `cmd.exe`/PowerShell —
اجرای shell رایج‌ترین محرک heuristic آنتی‌ویروس است.

`installMode: "currentUser"` + `webviewInstallMode: "skip"` یعنی **بدون UAC و بدون
دانلود مخفی runtime**.

---

## فاز ۲ — موتور Markdown

پایپ‌لاین: `source → markdown-it → DOMPurify → applyDirection → DOM`

پوشش داده شد: H1–H6، bold/italic/strikethrough، لیست تودرتو، task list،
جدول GFM، fenced code با ۲۷ زبان، autolink، تصویر، blockquote، جداکننده،
لینک داخلی، Unicode کامل.

**تصمیم‌های مهم:**

- **لینک‌ها inert هستند.** `href` واقعی به `data-external` منتقل و `href="#"`
  می‌شود. حتی اگر هندلر کلیک ما fail کند، webview نمی‌تواند navigate کند.
- **تصاویر خارجی معلق‌اند** پشت `data-src` تا تنظیمات اجازه دهد.
- **جدول‌ها همیشه در `.table-wrap` بسته می‌شوند** — پیش‌نیاز مهار سرریز.
- **highlight.js فقط ۲۷ زبان** بارگذاری می‌شود نه ۱۹۰ تا. زبان ناشناس →
  متن escape شده، بدون throw.
- **typographer خاموش است** چون `--` را در متن فارسی خراب می‌کند.
- **slug فارسی** با `encodeURIComponent` تولید می‌شود تا `## نصب` واقعاً
  آدرس‌پذیر باشد (slug گیت‌هابی آن را کاملاً دور می‌ریزد).

### 🐛 باگ امنیتی واقعی که تست پیدا کرد

`USE_PROFILES: { html: true }` در DOMPurify روی `ALLOWED_TAGS` **غلبه می‌کند**
و allowlist صریح ما را بی‌اثر کرده بود — یعنی هر تگ پروفایل HTML دوباره
مجاز می‌شد. حذف شد و تست `stripImages` حالا پاس است.

---

## فاز ۳ — ⭐ موتور جهت (قلب پروژه)

### `src/direction/unicode.ts`

- ۱۲ بازه strong RTL (عربی، فارسی، عبری، سریانی، تانا، نکو، Presentation Forms)
- ۶ بازه strong LTR (لاتین، یونانی، سیریلیک)
- **۲۳ بازه استثنا** داخل بلوک‌های RTL که *قوی نیستند*
- ۱۰ regex برای حذف نویز: کد fenced/inline، URL، مسیر ویندوز و POSIX،
  ایمیل، تگ HTML، مقصد لینک

### 🐛 باگ واقعی که تست پیدا کرد

ارقام فارسی `۰-۹` (U+06F0–06F9) و عربی `٠-٩` (U+0660–0669) **وسط بلوک عربی**
هستند ولی کلاس Bidi آنها EN/AN یعنی **خنثی**. قبل از اصلاح، یک سلول جدول
عددی ادعای RTL می‌کرد. همچنین حرکات (harakat) و نقطه‌گذاری عبری که NSM هستند.
هر ۲۳ بازه استثنا شد.

### `src/direction/apply.ts` — سه پاس روی DOM

1. **پاس اول:** هر بلوکی که شواهد خودش را دارد. اگر متن مستقیمش خنثی بود،
   دوباره با متن فرزندان امتحان می‌شود (چون `<blockquote>` فقط `<p>` دارد).
2. **پاس دوم:** بلوک‌های خنثی از خواهر-برادر resolved شده ارث می‌برند
   (قبلی → بعدی → جد → fallback).
3. **پاس سوم:** جدول و لیست با **رأی اکثریت سلول/آیتم** جهت می‌گیرند، چون
   ترتیب ستون و سمت بولت به آن وابسته است.

### 🐛 دو باگ طراحی دیگر که تست پیدا کرد

- `blockquote` همیشه LTR می‌شد چون متن مستقیم نداشت → پاس متن عمیق اضافه شد.
- آیتم لیست `- ۱۲۳۴۵` بین دو آیتم فارسی، LTR می‌شد چون `<ul>` هنوز جهت
  نگرفته بود → ارث‌بری از خواهر-برادر اضافه شد.

### مواردی که `dir="auto"` مرورگر اشتباه می‌کند و ما درست می‌کنیم

| ورودی | `dir="auto"` | B mark |
|---|---|---|
| ``` `npm install` را در ترمینال اجرا کنید. ``` | ❌ LTR | ✅ RTL |
| `https://github.com را باز کنید و فورک کنید.` | ❌ LTR | ✅ RTL |
| `Visual Studio Code یکی از بهترین ویرایشگرهاست.` | ❌ LTR | ✅ RTL |
| `فایل را در C:\Users\Ali\note.md ذخیره کنید.` | ❌ LTR | ✅ RTL |
| `The Persian word for hello is سلام, common.` | ✅ LTR | ✅ LTR |
| `- مورد فارسی / - ۱۲۳۴۵ / - مورد دیگر` | ❌ آیتم وسط LTR | ✅ همه RTL |
| `> این یک نقل‌قول فارسی است.` | ❌ LTR | ✅ RTL |

---

## نتایج اندازه‌گیری

| معیار | مقدار |
|---|---|
| تست‌های واحد | **۸۷ پاس / ۰ ناموفق** |
| باگ‌های واقعی که تست‌ها پیدا کردند | **۴** (۱ امنیتی، ۳ منطق جهت) |
| JS نهایی | ۳۰۸.۷۹ KB (gzip: ۱۱۵.۷۵ KB) |
| CSS نهایی | ۱۲.۵۹ KB (gzip: ۳.۳۰ KB) |
| فونت | ۵۹۲ KB (۹ وزن + variable) |
| کل `dist/` | **۹۰۸ KB** |
| رندر ۲۰۰۰ پاراگراف ترکیبی | ۶۵۳ ms |

---

## چه چیزی هنوز کار نمی‌کند (صادقانه)

| مورد | وضعیت |
|---|---|
| دکمه Open File | **disabled** — نیاز به فاز ۸ (Rust) |
| دکمه Settings | **disabled** — فاز ۹ |
| سوییچ زبان UI | فاز ۶ |
| Drag & Drop / File Association | کد Rust نوشته شده، کامپایل نشده |
| لوگو | ⏸ placeholder — منتظر فایل تو |
| `B mark.exe` | نیاز به ماشین ویندوز یا GitHub Actions |

دکمه‌های غیرفعال عمداً `disabled` هستند و ظاهرسازی نمی‌کنند — طبق قید
«از ساختن Mockup خودداری کن» در سند.

**آنچه همین الان واقعاً کار می‌کند:** رندر Markdown، تشخیص جهت خودکار،
سوییچ Auto/RTL/LTR، Zoom (دکمه + میانبر)، تعویض تم، اسکرول به لنگر داخلی،
نوار وضعیت زنده.
