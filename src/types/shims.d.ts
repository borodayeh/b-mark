// Ambient declarations for dependencies that ship no types of their own.

declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default plugin;
}

declare module 'markdown-it-footnote' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-mark' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-ins' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-sub' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-sup' {
  import type { MarkdownIt } from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

// Vite import suffixes.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
declare module '*.css?inline' {
  const content: string;
  export default content;
}
declare module 'katex/dist/katex.min.css';

// Hunspell dictionary files, imported as bundled asset URLs. The
// `dictionary-*` packages read them with `node:fs` at module scope, which
// cannot work in a webview, so the raw files are used directly.
declare module '*.aff?url' {
  const url: string;
  export default url;
}
declare module '*.dic?url' {
  const url: string;
  export default url;
}

// Injected by Vite from package.json — see vite.config.ts. Vitest evaluates
// the same config, so it is defined in tests too.
declare const __APP_VERSION__: string;
declare const __BUILD_STAMP__: string;
