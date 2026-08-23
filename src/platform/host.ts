/**
 * Host abstraction.
 *
 * B mark runs in two hosts: the Tauri desktop shell, and a plain browser
 * during `npm run dev`. Rather than sprinkling `if (isTauri())` through the
 * UI, everything the app needs from its host lives behind this one interface.
 *
 * That is not just tidiness. It means the whole Markdown and direction engine
 * can be exercised, and regressions caught, without a Rust toolchain — and
 * that every capability has an honest browser answer instead of a dead button.
 */

export interface FolderEntry {
  path: string;
  name: string;
  isDir: boolean;
  bytes: number;
  modifiedMs: number;
}

export interface ExportFile {
  /** Suggested file name including its extension, e.g. `notes.docx`. */
  name: string;
  bytes: Uint8Array;
  /** MIME type, used by the browser fallback. */
  mime: string;
  /** Human-readable filter label for the save dialog, e.g. `Word document`. */
  filterName: string;
  /** Extensions offered by the save dialog, without a dot. */
  extensions: string[];
}

export interface OpenedDocument {
  path: string;
  name: string;
  /** Directory of the file, used to resolve relative image paths. */
  dir: string;
  content: string;
  bytes: number;
  modifiedMs: number;
}

export interface Host {
  readonly kind: 'tauri' | 'browser';

  /** Ask the user for a Markdown file. Resolves null when cancelled. */
  pickFile(): Promise<OpenedDocument | null>;

  /** Read a specific path (drag & drop, CLI argument, file association). */
  readFile(path: string): Promise<OpenedDocument>;

  /** Write the buffer back. Only used by editor mode. */
  writeFile(path: string, content: string): Promise<number>;

  /** True when this host can persist edits to the original file. */
  readonly canSave: boolean;

  /**
   * Write an exported artefact somewhere the user chooses.
   *
   * This is deliberately not `<a download>`: WebView2 has no download manager
   * behind an anchor, so the click is dropped and the app happily reports
   * success for a file that was never written. The Tauri host therefore shows
   * a real save dialog; the browser host keeps the anchor, where it works.
   *
   * Resolves the file name written, or null when the user cancelled.
   */
  saveExport(file: ExportFile): Promise<string | null>;

  /** Open a URL in the user's default browser, never in the app. */
  openExternal(url: string): Promise<void>;

  /** Reveal the file in Explorer / Finder. */
  revealInFolder(path: string): Promise<void>;

  /** Start watching a file; the callback fires when it changes on disk. */
  watch(path: string, onChange: () => void): Promise<void>;
  unwatchAll(): Promise<void>;

  // --- folder browsing -----------------------------------------------------
  /** True when this host can enumerate a directory. */
  readonly canBrowseFolders: boolean;
  /** Ask the user for a folder. Resolves null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Subdirectories and Markdown files in `path`. */
  listFolder(path: string): Promise<FolderEntry[]>;
  parentFolder(path: string): Promise<string | null>;

  /** Files handed to the app on launch (CLI argument, "Open with", drop). */
  onOpenRequest(handler: (paths: string[]) => void): void;

  /** Native drag & drop of a file onto the window. */
  onFileDrop(handler: (paths: string[]) => void): void;

  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<void>;

  // --- window controls -----------------------------------------------------
  // The app draws its own title bar, so it has to drive the window itself.
  // A browser tab has no window to minimise, which is why `hasWindowControls`
  // exists rather than three buttons that quietly do nothing.
  readonly hasWindowControls: boolean;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  close(): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  /** Fires whenever the window is maximised or restored. */
  onMaximizeChange(handler: (maximized: boolean) => void): void;

  // --- updates -------------------------------------------------------------
  /** True when this build can check for and install updates. */
  readonly canUpdate: boolean;
  /**
   * Ask the update endpoint whether a newer version exists.
   * Resolves null when already current. Never called on a timer.
   */
  checkForUpdate(): Promise<{ version: string; notes: string } | null>;
  /** Download and install the update found by `checkForUpdate`, then restart. */
  installUpdate(): Promise<void>;
}

export const MARKDOWN_EXTS = ['md', 'markdown', 'mdown', 'mkd', 'mdwn', 'mdtxt'];

export function hasMarkdownExtension(name: string): boolean {
  return MARKDOWN_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function dirName(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('\\');
}

/** Human-readable byte count, for error messages. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Errors the Rust side reports as `reason:detail`, mapped to i18n keys so the
 * user sees a translated sentence rather than a Rust string.
 */
export function describeHostError(error: unknown): { key: string; vars: Record<string, string> } {
  const message = String(error ?? '');

  // Split on the FIRST colon only. `String.split(':', 2)` would truncate at
  // the drive letter of a Windows path — "unsupported_extension:C:\tmp\x.exe"
  // would yield a detail of just "C".
  const cut = message.indexOf(':');
  const reason = cut === -1 ? message : message.slice(0, cut);
  const detail = cut === -1 ? '' : message.slice(cut + 1);

  switch (reason) {
    case 'file_too_large':
      return { key: 'toast.fileTooLarge', vars: { size: formatBytes(Number(detail) || 0) } };
    case 'unsupported_extension':
      return { key: 'toast.unsupportedFile', vars: { name: baseName(detail) } };
    default:
      return { key: 'toast.readFailed', vars: {} };
  }
}
