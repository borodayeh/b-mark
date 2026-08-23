/**
 * HTML sanitisation.
 *
 * Even with `html: false` in markdown-it this runs, because a malformed
 * document or a future plugin could still emit markup we did not intend.
 * Defence in depth: the renderer decides what to emit, this decides what is
 * allowed to reach the DOM, and the CSP in tauri.conf.json is the last line.
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a','abbr','b','blockquote','br','caption','code','col','colgroup','dd','del',
  'details','div','dl','dt','em','figcaption','figure','h1','h2','h3','h4','h5',
  'h6','hr','i','img','ins','kbd','li','mark','ol','p','pre','q','rp','rt','ruby',
  's','samp','section','small','span','strong','sub','summary','sup','table',
  'tbody','td','tfoot','th','thead','tr','ul','var','wbr','input','aside',
  // KaTeX emits MathML alongside its HTML output.
  'math','semantics','annotation','mrow','mi','mo','mn','ms','mtext','mspace',
  'msub','msup','msubsup','mfrac','msqrt','mroot','mstyle','munder','mover',
  'munderover','mtable','mtr','mtd','mpadded','mphantom','menclose','merror',
  'maction','mglyph','mlabeledtr','mmultiscripts','mprescripts','none',
];

const ALLOWED_ATTR = [
  'href','src','alt','title','class','id','dir','lang','colspan','rowspan',
  'start','type','checked','disabled','align','loading','decoding','width','height',
  'data-external','data-anchor','data-relative','data-remote','data-src',
  'data-relative-src','data-lang','data-bmark-dir',
  // Footnotes need back-references; KaTeX needs its own markup attributes.
  'role','aria-label','aria-describedby','aria-hidden','tabindex',
  'data-footnote-ref','data-footnote-backref','data-latex','data-typeset',
  'mathvariant','displaystyle','scriptlevel','stretchy','encoding','xmlns',
  'accent','fence','separator','linethickness','columnalign','rowspacing',
];

let configured = false;

function configure(): void {
  if (configured) return;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    // Task-list checkboxes are the only inputs we permit, and they stay inert.
    if (node.tagName === 'INPUT') {
      const type = node.getAttribute('type');
      if (type !== 'checkbox') {
        node.remove();
        return;
      }
      node.setAttribute('disabled', '');
      node.removeAttribute('name');
      node.removeAttribute('value');
      return;
    }

    // Belt and braces: no href may ever carry an executable scheme.
    const href = node.getAttribute('href');
    if (href && /^\s*(javascript|vbscript|data)\s*:/i.test(href)) {
      node.removeAttribute('href');
    }
    const src = node.getAttribute('src');
    if (src && /^\s*(javascript|vbscript)\s*:/i.test(src)) {
      node.removeAttribute('src');
    }
  });

  configured = true;
}

export interface SanitizeOptions {
  /** Strip <img> entirely (Settings → block external images, hard mode). */
  stripImages?: boolean;
}

export function sanitize(html: string, options: SanitizeOptions = {}): string {
  configure();

  const tags = options.stripImages
    ? ALLOWED_TAGS.filter((t) => t !== 'img')
    : [...ALLOWED_TAGS, 'img'];

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR,
    // No <script>, <style>, <iframe>, <object>, <embed>, <form>, <base>.
    FORBID_TAGS: ['script','style','iframe','object','embed','form','base','link','meta','noscript'],
    FORBID_ATTR: ['style','srcset','ping','formaction','onerror','onload','onclick'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    // NOTE: `USE_PROFILES` is deliberately NOT set. DOMPurify lets a profile
    // override an explicit ALLOWED_TAGS list, which silently re-admitted every
    // tag in the HTML profile (caught by tests/markdown.spec.ts).
  }) as unknown as string;
}
