# چک‌لیست پذیرش — بند ۱۶ سند

| # | معیار | وضعیت | مدرک |
|---|---|---|---|
| ۱ | با نام `B mark` ساخته شده | ✅ | `productName` در `tauri.conf.json` |
| ۲ | فایل اجرایی ویندوز تولید می‌شود | ⚙️ | نیازمند ویندوز/CI — `build-portable.ps1` و workflow آماده |
| ۳ | اجرا بدون Administrator | ✅ | `installMode: currentUser`، بدون نوشتن در `Program Files`/HKLM |
| ۴ | نسخهٔ Portable یا Per-User | ✅ | هر دو در workflow ساخته می‌شوند |
| ۵ | اجرا روی ویندوز ۱۰ و ۱۱ | ⚙️ | هدف `chrome105`؛ نیازمند تست روی سخت‌افزار |
| ۶ | متن فارسی درست RTL | ✅ | ۲۶ تست جهت + ۲۶ تست پایپ‌لاین |
| ۷ | متن انگلیسی درست LTR | ✅ | همان |
| ۸ | سند ترکیبی، جهت صحیح هر بخش | ✅ | `['rtl','rtl','rtl','ltr','rtl','rtl']` در تأیید زنده |
| ۹ | فونت پیش‌فرض Vazirmatn | ✅ | `--font-ui`/`--font-content`/`--font-code` |
| ۱۰ | نسخهٔ Embedded در نبود فونت سیستمی | ✅ | `local()` سپس `url()` — ۹ وزن + variable |
| ۱۱ | پاراگراف بلند بیرون نمی‌زند | ✅ | تأیید پیکسلی در ۳۶۰/۴۳۰/۶۰۰/۱۲۸۰ |
| ۱۲ | جدول/تصویر/کد/URL چیدمان را خراب نمی‌کنند | ✅ | ۲۳ تست سرریز + تأیید پیکسلی |
| ۱۳ | اسکرول افقی ناخواسته وجود ندارد | ✅ | `scrollWidth === clientWidth` در همهٔ عرض‌ها |
| ۱۴ | Markdown و GFM درست رندر می‌شوند | ✅ | ۳۵ تست |
| ۱۵ | رابط فارسی و انگلیسی | ✅ | ۱۵ تست i18n |
| ۱۶ | تم Light/Dark/Auto | ✅ | تأیید زنده |
| ۱۷ | تنظیمات ذخیره و بازیابی می‌شوند | ✅ | ۴۵ تست + تأیید پس از reload |
| ۱۸ | Drag & Drop و File Association | ✅ کد / ⚙️ تست | مرورگر تأیید شد؛ بومی نیازمند کامپایل |
| ۱۹ | ظاهر مدرن، تمیز، حرفه‌ای | ✅ | ۱۴ اسکرین‌شات |
| ۲۰ | ساختار مرتب و مستند برای گیت‌هاب | ✅ | ۷ فایل مستندات + ۵ گزارش فاز |
| ۲۱ | README فارسی و انگلیسی | ✅ | `README.md` + `README.fa.md` |
| ۲۲ | منبع فونت و منابع الهام ذکر شده | ✅ | `THIRD-PARTY.md` + جدول اعتبار در هر دو README |
| ۲۳ | بدون رفتار مشکوک یا مخفی | ✅ | `SECURITY.md` با جدول «کجا بررسی کنید» |
| ۲۴ | محدودیت‌های Signing/WebView2/Single-EXE شفاف مستند شده | ✅ | بخش اختصاصی در هر دو README + `SECURITY.md` |
| ۲۵ | هیچ ادعای تضمین مطلق دربارهٔ آنتی‌ویروس | ✅ | صراحتاً رد شده در `SECURITY.md` |

**⚙️ = کد نوشته و بررسی شده، اما تأیید نهایی به ماشین ویندوز یا اجرای CI
نیاز دارد؛ Cargo در این محیط لینوکسی نصب نیست.** این موارد در سه اجرای
`build-windows.yml` روی `windows-latest` پوشش داده می‌شوند.

---

## تست‌های خودکار

```
tests/direction.spec.ts   ۲۶   موتور جهت، بازه‌های یونیکد، حذف نویز
tests/pipeline.spec.ts    ۲۶   جهت per-block روی DOM واقعی
tests/markdown.spec.ts    ۳۵   CommonMark، GFM، پاک‌سازی امنیتی، یونیکد
tests/overflow.spec.ts    ۲۳   مهار سرریز و ایزولاسیون دوجهته
tests/settings.spec.ts    ۴۵   schema، clamp، پایداری، اعمال روی DOM
tests/i18n.spec.ts        ۱۵   کامل‌بودن کاتالوگ، placeholder، جهت رابط
tests/platform.spec.ts    ۲۲   انتزاع میزبان، تخریب صادقانه، نگاشت خطا
tests/editor.spec.ts      ۱۷   ویرایشگر، میانبرها، همگام‌سازی اسکرول
                        ─────
                          ۲۰۹
```

## تأیید رفتاری با مرورگر headless

روی **بیلد production**، نه سرور توسعه:

```
host detected as browser                          PASS
save/edit disabled with no document               PASS
save stays disabled in browser (canSave = false)  PASS
split mode + textarea dir=auto                    PASS
typed Persian line renders RTL despite leading code  PASS
dirty flag appears                                PASS
no horizontal page scroll (split, 1280px)         PASS
editor pane does not scroll sideways              PASS
panes stack vertically below 760px                PASS
no horizontal scroll at 600px                     PASS
chrome flips to RTL, document keeps per-block dir PASS
Ctrl+E / Ctrl+, / Esc                             PASS
console errors                                    none
```
