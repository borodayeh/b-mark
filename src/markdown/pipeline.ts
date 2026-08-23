/**
 * The full pipeline, in one place: Markdown source → direction-aware DOM.
 */

import { renderMarkdownDetailed, renderMarkdown, type RenderOptions } from './renderer';
import { sanitize } from './sanitize';
import { typesetMath } from './math';
import { renderDiagrams, hasDiagrams } from './diagrams';
import { applyDirection, type ApplyDirectionOptions } from '../direction/apply';
import type { FrontMatter } from './frontmatter';

export interface PipelineOptions extends RenderOptions, ApplyDirectionOptions {
  stripImages?: boolean;
}

export interface PipelineResult {
  html: string;
  /** How many blocks resolved to RTL — shown in the status bar. */
  rtlBlocks: number;
  /** Milliseconds spent, for the "large file must not hang" requirement. */
  elapsedMs: number;
  /** Parsed YAML front matter, when the document had any. */
  frontMatter: FrontMatter | null;
  /** True when the document contains formulas awaiting KaTeX. */
  needsMath: boolean;
  /** True when the document contains Mermaid fences awaiting the library. */
  needsDiagrams: boolean;
}

/**
 * Renders into `target` (replacing its content). Working on a live element
 * rather than a detached string means `applyDirection` can walk real
 * ancestors when resolving inherited direction.
 */
export function renderInto(
  target: HTMLElement,
  source: string,
  options: PipelineOptions = {},
): PipelineResult {
  const t0 = performance.now();

  const rendered = renderMarkdownDetailed(source, options);
  const safeHtml = sanitize(rendered.html, { stripImages: options.stripImages ?? false });

  target.innerHTML = safeHtml;

  const rtlBlocks = applyDirection(target, {
    mode: options.mode ?? 'auto',
    fallback: options.fallback ?? 'ltr',
    codeFollowsProse: options.codeFollowsProse ?? false,
  });

  return {
    html: safeHtml,
    rtlBlocks,
    elapsedMs: performance.now() - t0,
    frontMatter: rendered.frontMatter,
    needsMath: rendered.math,
    needsDiagrams: hasDiagrams(target),
  };
}

/**
 * The heavy, optional passes. Kept out of `renderInto` so the document appears
 * immediately and the multi-megabyte libraries load behind it.
 */
export async function enhance(
  target: HTMLElement,
  options: { math: boolean; diagrams: boolean; theme: 'light' | 'dark' },
): Promise<void> {
  const jobs: Array<Promise<void>> = [];
  if (options.math) jobs.push(typesetMath(target));
  if (options.diagrams) jobs.push(renderDiagrams(target, options.theme));
  await Promise.all(jobs);
}

export { renderMarkdown, sanitize, applyDirection };
export type { FrontMatter };
