/**
 * Browser host — the `npm run dev` and preview backend.
 *
 * Where a capability genuinely does not exist in a browser, this reports that
 * honestly (`canSave: false`, a rejected promise) rather than pretending to
 * succeed. The UI reads those signals and disables or explains, which is why
 * the preview never shows a button that silently does nothing.
 */

import {
  baseName,
  hasMarkdownExtension,
  type ExportFile,
  type FolderEntry,
  type Host,
  type OpenedDocument,
  MARKDOWN_EXTS,
} from './host';

const STORAGE_KEY = 'b-mark.settings';

/** Files the user has handed us this session, keyed by their display path. */
const openedFiles = new Map<string, File>();

async function toDocument(file: File): Promise<OpenedDocument> {
  if (!hasMarkdownExtension(file.name)) {
    throw new Error(`unsupported_extension:${file.name}`);
  }
  const content = (await file.text()).replace(/^\uFEFF/, '');
  openedFiles.set(file.name, file);
  return {
    path: file.name,
    name: file.name,
    dir: '',
    content,
    bytes: file.size,
    modifiedMs: file.lastModified,
  };
}

export class BrowserHost implements Host {
  readonly kind = 'browser' as const;
  /** A browser cannot write back to the file the user picked. */
  readonly canSave = false;

  private dropHandler: ((paths: string[]) => void) | null = null;
  private input: HTMLInputElement | null = null;

  private fileInput(): HTMLInputElement {
    if (this.input) return this.input;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MARKDOWN_EXTS.map((e) => `.${e}`).join(',') + ',text/markdown';
    input.hidden = true;
    document.body.appendChild(input);
    this.input = input;
    return input;
  }

  pickFile(): Promise<OpenedDocument | null> {
    return new Promise((resolve, reject) => {
      const input = this.fileInput();
      input.value = '';

      const onChange = () => {
        cleanup();
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        toDocument(file).then(resolve, reject);
      };
      // `cancel` fires in Chromium when the picker is dismissed; without it a
      // cancelled dialog would leave this promise pending forever.
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        input.removeEventListener('change', onChange);
        input.removeEventListener('cancel', onCancel);
      };

      input.addEventListener('change', onChange);
      input.addEventListener('cancel', onCancel);
      input.click();
    });
  }

  async readFile(path: string): Promise<OpenedDocument> {
    const file = openedFiles.get(path);
    if (!file) throw new Error(`not_a_file:${path}`);
    return toDocument(file);
  }

  async writeFile(): Promise<number> {
    throw new Error('save_unavailable_in_browser');
  }

  /** A browser really does have a download manager, so the anchor works. */
  async saveExport(file: ExportFile): Promise<string | null> {
    const blob = new Blob([file.bytes as BlobPart], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking synchronously cancels the download in some Chromium builds.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return file.name;
  }

  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async revealInFolder(): Promise<void> {
    throw new Error('reveal_unavailable_in_browser');
  }

  /** No filesystem watching in a browser; live reload is a desktop feature. */
  async watch(): Promise<void> {
    /* intentionally a no-op */
  }

  async unwatchAll(): Promise<void> {
    /* intentionally a no-op */
  }

  /** A browser has no directory to enumerate; the UI hides the panel. */
  readonly canBrowseFolders = false;

  async pickFolder(): Promise<string | null> {
    return null;
  }

  async listFolder(): Promise<FolderEntry[]> {
    return [];
  }

  async parentFolder(): Promise<string | null> {
    return null;
  }

  onOpenRequest(): void {
    /* nothing launches the browser build with a file argument */
  }

  onFileDrop(handler: (paths: string[]) => void): void {
    this.dropHandler = handler;

    const stop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', (e) => {
      stop(e);
      document.body.classList.add('dropzone-active');
    });
    window.addEventListener('dragleave', (e) => {
      stop(e);
      if (e.relatedTarget === null) document.body.classList.remove('dropzone-active');
    });
    window.addEventListener('drop', (e) => {
      stop(e);
      document.body.classList.remove('dropzone-active');
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      // Register every File first so the subsequent readFile(path) calls can
      // find them — a multi-file drop must open all of its documents, not
      // silently keep only the first.
      for (const file of files) openedFiles.set(file.name, file);
      this.dropHandler?.(files.map((f) => f.name));
    });
  }

  // A browser tab is not a window we own; the UI hides the controls instead
  // of showing three buttons that do nothing.
  readonly hasWindowControls = false;

  async minimize(): Promise<void> {
    /* not available */
  }

  async toggleMaximize(): Promise<void> {
    /* not available */
  }

  async isMaximized(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    /* a page cannot close itself unless it opened itself */
  }

  async setFullscreen(on: boolean): Promise<void> {
    if (on) await document.documentElement.requestFullscreen().catch(() => undefined);
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  async isFullscreen(): Promise<boolean> {
    return document.fullscreenElement !== null;
  }

  onMaximizeChange(): void {
    /* nothing to observe */
  }

  /** A web page updates by being reloaded. */
  readonly canUpdate = false;

  async checkForUpdate(): Promise<null> {
    return null;
  }

  async installUpdate(): Promise<void> {
    /* not applicable */
  }

  async loadSettings(): Promise<string | null> {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  async saveSettings(json: string): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* private mode or a full quota — settings simply do not persist */
    }
  }
}

export { baseName };
