# Third-party components · اجزای شخص ثالث

[English](#english) · [فارسی](#persian)

B mark itself is [MIT](LICENSE) licensed. Full licence texts for everything
below are in [`docs/licenses/`](docs/licenses/) and, for the dictionaries, in
[`assets/dictionaries/`](assets/dictionaries/).

<a id="english"></a>

## Bundled inside the executable

| Component | Version | Licence | Purpose |
|---|---|---|---|
| [Vazirmatn](https://github.com/rastikerdar/vazirmatn) | 33.003 | SIL OFL 1.1 | Interface and content font — all 9 static weights plus the variable font |
| [markdown-it](https://github.com/markdown-it/markdown-it) | 15.0.0 | MIT | CommonMark + GFM parser |
| [markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists) | 2.1.1 | ISC | GFM task lists |
| [markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor) | 9.2.1 | Unlicense | Heading ids for internal links and the outline |
| [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote) | 4.0.0 | MIT | Footnotes |
| [markdown-it-deflist](https://github.com/markdown-it/markdown-it-deflist) | 4.0.0 | MIT | Definition lists |
| [markdown-it-mark](https://github.com/markdown-it/markdown-it-mark) | 4.0.0 | MIT | `==highlight==` |
| [markdown-it-ins](https://github.com/markdown-it/markdown-it-ins) | 4.0.0 | MIT | `++inserted++` |
| [markdown-it-sub](https://github.com/markdown-it/markdown-it-sub) | 2.0.0 | MIT | `~subscript~` |
| [markdown-it-sup](https://github.com/markdown-it/markdown-it-sup) | 2.0.0 | MIT | `^superscript^` |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.14 | MPL-2.0 OR Apache-2.0 | HTML sanitisation |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.12.0 | BSD-3-Clause | Syntax highlighting, 27 languages registered |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.16.47 | MIT | Maths. **Lazy** — never fetched by a document without maths |
| [Mermaid](https://github.com/mermaid-js/mermaid) | 11.17.0 | MIT | Diagrams. **Lazy** — never fetched by a document without a diagram |
| [docx](https://github.com/dolanmiu/docx) | 9.7.1 | MIT | Word export, including `w:bidi` and per-script runs |
| [nspell](https://github.com/wooorm/nspell) | 2.1.5 | MIT | Hunspell engine for the optional spell checker |
| [Tauri](https://github.com/tauri-apps/tauri) | 2.x | MIT OR Apache-2.0 | Desktop shell |
| [Lilak](https://github.com/b00f/lilak) Persian dictionary | 2015 | Apache-2.0 | Persian spell checking. Vendored, not imported — see `assets/dictionaries/README.md` |
| [SCOWL](http://wordlist.sourceforge.net) en_US dictionary | 2020.12.07 | BSD-style, see `en-LICENSE.txt` | English spell checking |

KaTeX and Mermaid are the two heavy dependencies. Both are code-split, so the
entry chunk stays around 440 KB and a plain document loads neither.

## Studied for design only — no code copied

| Project | Licence | What we looked at |
|---|---|---|
| [MarkText](https://github.com/marktext/marktext) | MIT | Toolbar layout, theme-token structure, and its document-level `dir` handling in `printService.ts` — exactly the limitation B mark's per-block engine was built to fix. Archived copy: `docs/references/marktext-*` |
| [Zettlr](https://github.com/Zettlr/Zettlr) | GPL-3.0 | Settings organisation and JSON-file i18n layout. **Nothing was copied** — GPL-3.0 is incompatible with this project's MIT licence |
| [Obsidian](https://obsidian.md) | Proprietary | UX patterns only. Obsidian is **not** open source and B mark is unaffiliated |
| [docu.md](https://docu.md/) | Proprietary | Visual direction for the reading surface |
| [Tauri file-associations example](https://github.com/tauri-apps/tauri/tree/dev/examples/file-associations) | MIT OR Apache-2.0 | CLI arguments and Windows file associations. Archived copy: `docs/references/tauri-file-assoc/` |

## Deliberately not used

| Component | Why |
|---|---|
| React / Vue / Svelte | The app has a handful of views; plain TypeScript keeps the entry chunk small and the DOM under our own control, which the direction engine depends on |
| `tauri-plugin-fs` | Grants far broader disk access than a Markdown viewer needs. All file access goes through our own commands with an extension allow-list — see SECURITY.md |
| `markdown-it-front-matter` | It consumes an unterminated `---` block to end of file, so a document beginning with `---` rendered blank. Replaced with `src/markdown/frontmatter.ts`, which requires the closing delimiter |
| `dictionary-fa` / `dictionary-en` npm packages | They read their data with `node:fs` at module scope, which cannot work in a webview, and their `exports` map does not expose the raw files |

---

<div align="right">

<a id="persian"></a>

## اجزای شخص ثالث

خودِ B mark با مجوز [MIT](LICENSE) منتشر می‌شود. متن کامل مجوز همهٔ موارد بالا
در [`docs/licenses/`](docs/licenses/) و برای واژه‌نامه‌ها در
[`assets/dictionaries/`](assets/dictionaries/) موجود است.

جدول‌های بالا سه دسته‌اند:

**جاسازی‌شده در فایل اجرایی** — فونت وزیرمتن (SIL OFL 1.1)، پارسر markdown-it
و افزونه‌هایش، DOMPurify برای پاک‌سازی امنیتی، highlight.js برای رنگ‌آمیزی کد،
KaTeX برای فرمول و Mermaid برای نمودار (هر دو **تنبل**؛ سندی که فرمول یا نمودار
ندارد هیچ‌کدام را بارگذاری نمی‌کند)، کتابخانهٔ docx برای خروجی Word، موتور
nspell و واژه‌نامه‌های Lilak فارسی و SCOWL انگلیسی برای غلط‌یاب اختیاری، و
پوستهٔ دسکتاپ Tauri.

**فقط برای الهام طراحی بررسی شده — هیچ کدی کپی نشده.** به‌طور خاص Zettlr با
مجوز GPL-3.0 است و با مجوز MIT این پروژه ناسازگار؛ از آن هیچ چیزی برداشته
نشده. Obsidian متن‌باز نیست و B mark هیچ وابستگی به آن ندارد.

**عمداً استفاده نشده** — فریم‌ورک‌های UI (تایپ‌اسکریپت خالی، چانک را کوچک و DOM
را در کنترل موتور جهت نگه می‌دارد)، افزونهٔ عمومی `tauri-plugin-fs` (دسترسی
دیسک بسیار گسترده‌تر از نیاز یک نمایشگر مارک‌داون)،
`markdown-it-front-matter` (بلوک `---` بسته‌نشده را تا انتهای فایل می‌بلعد و
سند را سفید می‌کرد)، و بسته‌های npm واژه‌نامه (در سطح ماژول از `node:fs`
می‌خوانند که در وب‌ویو ممکن نیست).

</div>
