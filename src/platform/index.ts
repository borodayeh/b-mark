/**
 * Host selection.
 *
 * Tauri 2 injects `__TAURI_INTERNALS__` before any application script runs,
 * so this is a reliable synchronous check — no probing, no race.
 */

import type { Host } from './host';
import { BrowserHost } from './browser-host';

let instance: Host | null = null;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getHost(): Host {
  if (instance) return instance;
  instance = new BrowserHost();
  return instance;
}

/**
 * Upgrade to the Tauri host when running natively.
 *
 * Called once during boot. The Tauri module is loaded lazily so the browser
 * build never pulls it in, and a failure here degrades to the browser host
 * rather than a blank window.
 */
export async function initHost(): Promise<Host> {
  if (!isTauri()) {
    instance = new BrowserHost();
    return instance;
  }
  try {
    const { TauriHost } = await import('./tauri-host');
    instance = new TauriHost();
  } catch (error) {
    console.error('[b-mark] Tauri host failed to initialise, falling back:', error);
    instance = new BrowserHost();
  }
  return instance;
}

export type { Host, OpenedDocument, FolderEntry, ExportFile } from './host';
export {
  MARKDOWN_EXTS,
  hasMarkdownExtension,
  baseName,
  dirName,
  formatBytes,
  describeHostError,
} from './host';
