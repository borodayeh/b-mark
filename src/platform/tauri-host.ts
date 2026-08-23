/**
 * Tauri host — talks to the Rust commands in src-tauri/src/.
 *
 * Every `@tauri-apps` import is dynamic. That keeps them out of the browser
 * bundle's critical path and, more importantly, means a missing plugin can
 * never take down the whole app at module-evaluation time.
 */

import {
  baseName,
  dirName,
  type FolderEntry,
  type ExportFile,
  type Host,
  type OpenedDocument,
  MARKDOWN_EXTS,
} from './host';

interface RustFile {
  path: string;
  name: string;
  dir: string;
  content: string;
  bytes: number;
  modified_ms: number;
}

function toDocument(file: RustFile): OpenedDocument {
  return {
    path: file.path,
    name: file.name,
    dir: file.dir,
    content: file.content,
    bytes: file.bytes,
    modifiedMs: file.modified_ms,
  };
}

export class TauriHost implements Host {
  readonly kind = 'tauri' as const;
  readonly canSave = true;

  private watchHandlers = new Map<string, () => void>();
  private changeListenerBound = false;

  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }

  async pickFile(): Promise<OpenedDocument | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Markdown', extensions: MARKDOWN_EXTS }],
    });
    if (typeof selected !== 'string') return null;
    return this.readFile(selected);
  }

  async readFile(path: string): Promise<OpenedDocument> {
    const file = await this.invoke<RustFile>('read_markdown_file', { path });
    return toDocument(file);
  }

  async writeFile(path: string, content: string): Promise<number> {
    return this.invoke<number>('write_markdown_file', { path, content });
  }

  async saveExport(file: ExportFile): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: file.name,
      filters: [{ name: file.filterName, extensions: file.extensions }],
    });
    if (typeof path !== 'string' || path.length === 0) return null;

    // Tauri serialises a Uint8Array as a JSON number array. That is roughly
    // 4x the payload size, which is fine for a document export (tens to
    // hundreds of kilobytes) and avoids pulling in a base64 dependency on
    // both sides just to move it.
    await this.invoke<number>('write_export_file', { path, bytes: Array.from(file.bytes) });
    return path.split(/[\\/]/).pop() ?? path;
  }

  async openExternal(url: string): Promise<void> {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }

  async revealInFolder(path: string): Promise<void> {
    await this.invoke('reveal_in_explorer', { path });
  }

  async watch(path: string, onChange: () => void): Promise<void> {
    this.watchHandlers.set(path, onChange);

    if (!this.changeListenerBound) {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string>('b-mark://file-changed', (event) => {
        this.watchHandlers.get(event.payload)?.();
      });
      this.changeListenerBound = true;
    }

    await this.invoke('watch_file', { path });
  }

  async unwatchAll(): Promise<void> {
    this.watchHandlers.clear();
    await this.invoke('unwatch_all');
  }

  readonly canBrowseFolders = true;

  async pickFolder(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === 'string' ? selected : null;
  }

  async listFolder(path: string): Promise<FolderEntry[]> {
    interface RustEntry {
      path: string;
      name: string;
      is_dir: boolean;
      bytes: number;
      modified_ms: number;
    }
    const rows = await this.invoke<RustEntry[]>('list_folder', { path });
    return rows.map((r) => ({
      path: r.path,
      name: r.name,
      isDir: r.is_dir,
      bytes: r.bytes,
      modifiedMs: r.modified_ms,
    }));
  }

  async parentFolder(path: string): Promise<string | null> {
    return this.invoke<string | null>('parent_folder', { path });
  }

  onOpenRequest(handler: (paths: string[]) => void): void {
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string[]>('b-mark://open-files', (event) => handler(event.payload));
    })();
  }

  onFileDrop(handler: (paths: string[]) => void): void {
    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') handler(event.payload.paths);
      });
    })();
  }

  readonly hasWindowControls = true;

  private async win() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  }

  async minimize(): Promise<void> {
    await (await this.win()).minimize();
  }

  async toggleMaximize(): Promise<void> {
    await (await this.win()).toggleMaximize();
  }

  async isMaximized(): Promise<boolean> {
    return (await this.win()).isMaximized();
  }

  async close(): Promise<void> {
    await (await this.win()).close();
  }

  async setFullscreen(on: boolean): Promise<void> {
    await (await this.win()).setFullscreen(on);
  }

  async isFullscreen(): Promise<boolean> {
    return (await this.win()).isFullscreen();
  }

  onMaximizeChange(handler: (maximized: boolean) => void): void {
    void (async () => {
      const w = await this.win();
      // Resize covers the snap gestures and the double-click on the drag bar,
      // which do not raise a dedicated maximize event.
      await w.onResized(async () => handler(await w.isMaximized()));
      handler(await w.isMaximized());
    })();
  }

  readonly canUpdate = true;

  /** Held between the check and the install so the download is not repeated. */
  private pendingUpdate: { downloadAndInstall: () => Promise<void> } | null = null;

  async checkForUpdate(): Promise<{ version: string; notes: string } | null> {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      this.pendingUpdate = null;
      return null;
    }
    this.pendingUpdate = update;
    return { version: update.version, notes: update.body ?? '' };
  }

  async installUpdate(): Promise<void> {
    if (!this.pendingUpdate) return;
    await this.pendingUpdate.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }

  async loadSettings(): Promise<string | null> {
    return this.invoke<string | null>('load_settings');
  }

  async saveSettings(json: string): Promise<void> {
    await this.invoke('save_settings', { json });
  }
}

export { baseName, dirName };
