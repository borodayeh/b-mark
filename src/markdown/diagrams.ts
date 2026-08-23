/**
 * Mermaid diagrams.
 *
 * Mermaid is by far the heaviest thing in this project, so it is never part of
 * the initial bundle: the fenced block renders as ordinary highlighted code,
 * and the library is imported only when a document actually contains a
 * ```mermaid fence. A user who never opens such a document pays nothing.
 *
 * The fallback matters. If the chunk fails to load, or the diagram source is
 * invalid, the block stays readable as code rather than collapsing to an empty
 * space — the same principle as an unknown language in the highlighter.
 */

/** Mermaid's default export is a `Mermaid` instance, not the module itself. */
type MermaidApi = Awaited<typeof import('mermaid')>['default'];

let mermaidPromise: Promise<MermaidApi | null> | null = null;
let currentTheme: 'light' | 'dark' | null = null;
let counter = 0;

async function loadMermaid(): Promise<MermaidApi | null> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then((m) => m.default)
      .catch((error) => {
        console.warn('[b-mark] Mermaid failed to load; diagrams stay as code:', error);
        return null;
      });
  }
  return mermaidPromise;
}

/** Cheap pre-check so a document with no diagram never triggers the import. */
export function hasDiagrams(root: HTMLElement): boolean {
  return root.querySelector('.code-block[data-lang="mermaid"]') !== null;
}

function configure(mermaid: MermaidApi, theme: 'light' | 'dark'): void {
  if (currentTheme === theme) return;
  currentTheme = theme;

  mermaid.initialize({
    startOnLoad: false,
    // `strict` forbids raw HTML inside diagram labels, which is the only
    // injection vector Mermaid meaningfully has.
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim(),
    // Diagram labels are frequently Persian; Mermaid lays out left-to-right
    // but the label text itself must still shape correctly, which it does as
    // long as the font stack is ours rather than Mermaid's default.
    themeVariables: {
      fontSize: '14px',
    },
    flowchart: { htmlLabels: false, useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });
}

/**
 * Turn every ```mermaid block in `root` into a rendered diagram.
 * Blocks that fail to parse are left as code with an error note.
 */
export async function renderDiagrams(
  root: HTMLElement,
  theme: 'light' | 'dark',
): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('.code-block[data-lang="mermaid"]:not([data-rendered])'),
  );
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid();
  if (!mermaid) return;

  configure(mermaid, theme);

  for (const block of blocks) {
    const source = block.querySelector('code')?.textContent ?? '';
    if (source.trim().length === 0) continue;

    const id = `bmark-diagram-${counter++}`;
    try {
      const { svg } = await mermaid.render(id, source);

      const figure = document.createElement('figure');
      figure.className = 'diagram';
      // A diagram is a picture, not prose; it has no reading direction.
      figure.setAttribute('dir', 'ltr');
      figure.innerHTML = svg;

      // Keep the source one click away rather than throwing it away.
      const details = document.createElement('details');
      details.className = 'diagram__source';
      const summary = document.createElement('summary');
      summary.textContent = 'mermaid';
      details.appendChild(summary);
      details.appendChild(block.cloneNode(true));
      figure.appendChild(details);

      block.replaceWith(figure);
    } catch (error) {
      // Mermaid leaves its scratch element behind when rendering throws.
      document.getElementById(id)?.remove();
      document.querySelector(`#d${id}`)?.remove();

      block.setAttribute('data-rendered', 'failed');
      block.classList.add('code-block--diagram-error');
      const note = document.createElement('p');
      note.className = 'diagram__error';
      note.setAttribute('dir', 'ltr');
      note.textContent = `Mermaid: ${(error as Error)?.message?.split('\n')[0] ?? 'invalid diagram'}`;
      block.appendChild(note);
    }
  }
}

/** Re-render on theme change; the SVG bakes its colours in. */
export function invalidateDiagramTheme(): void {
  currentTheme = null;
}
