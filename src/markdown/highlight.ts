/**
 * Syntax highlighting.
 *
 * highlight.js ships ~190 languages (5.4 MB unpacked). Bundling all of them
 * would triple the app payload for languages nobody opens in a Markdown
 * viewer, so we register an explicit, curated set. Anything else falls back to
 * escaped plain text — still perfectly readable, per the spec's "at minimum a
 * legible rendering of code in various languages".
 */

import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, unknown> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  php,
  plaintext,
  powershell,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, def] of Object.entries(LANGUAGES)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hljs.registerLanguage(name, def as any);
}

// Common aliases people actually type in fences.
const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  cs: 'csharp',
  'c++': 'cpp',
  'c#': 'csharp',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  yml: 'yaml',
  toml: 'ini',
  conf: 'ini',
  ps1: 'powershell',
  pwsh: 'powershell',
  md: 'markdown',
  text: 'plaintext',
  txt: 'plaintext',
  postgres: 'sql',
  mysql: 'sql',
  docker: 'dockerfile',
  patch: 'diff',
};

export function resolveLanguage(lang: string): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase().trim();
  const resolved = ALIASES[key] ?? key;
  return hljs.getLanguage(resolved) ? resolved : null;
}

export function isLanguageSupported(lang: string): boolean {
  return resolveLanguage(lang) !== null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Highlight a fenced block. Returns the inner HTML of `<code>` — markdown-it
 * wraps it. On any failure we degrade to escaped text rather than throwing;
 * a broken highlighter must never blank the document.
 */
export function highlightCode(code: string, lang: string): string {
  const resolved = resolveLanguage(lang);
  if (!resolved) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES).sort();
