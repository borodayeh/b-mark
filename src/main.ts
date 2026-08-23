/**
 * B mark — application entry.
 *
 * Layout, top to bottom:
 *
 *   titlebar   brand · document name · window controls   (frameless caption)
 *   tabstrip   one tab per open document                 (hidden when ≤1)
 *   toolbar    open/reload/edit/save · direction · find/outline/export · zoom
 *   body       outline sidebar | editor pane | preview pane
 *   statusbar  path · flags · stats · direction · zoom
 *
 * Anything that touches the outside world goes through `src/platform/`, so
 * this file never asks whether it is running under Tauri or in a browser.
 */

import './styles/app.css';
import { renderInto, enhance, type PipelineOptions } from './markdown/pipeline';
import { icon, ICONS } from './components/icons';
import { brandMark, iconPlate } from './components/logo';
import { TitleBar } from './components/titlebar';
import { Outline } from './components/outline';
import { FindController } from './components/find';
import { clearSpellHighlights, highlightMisspellings } from './components/spell-highlight';
import { releaseDictionaries } from './persian/spellcheck';
import { analyse, type DocumentStats } from './components/stats';
import { attachCodeCopyButtons } from './components/code-copy';
import { exportHtml, printDocument } from './components/export';
import { exportDocx } from './components/docx-export';
import { applyContentTheme } from './components/content-themes';
import { FolderPanel } from './components/folder-panel';
import { openContextMenu, closeContextMenu } from './components/context-menu';
import { DocumentSet } from './components/documents';
import { attachImageZoom, closeLightbox, isLightboxOpen } from './components/lightbox';
import { copyAsRichText, copyAsMarkdown } from './components/rich-copy';
import { fixPersianText, ZWNJ_CHAR } from './persian/fix';
import { SplitEditor } from './editor/split-editor';
import { store } from './settings/store';
import { openSettings, closeSettings, isSettingsOpen } from './settings/panel';
import { RANGES } from './settings/schema';
import { t, localiseDigits, uiDirection } from './i18n';
import { initHost, describeHostError, baseName, type Host, type OpenedDocument } from './platform';
import faviconUrl from '../assets/branding/bmark-icon.svg?url';

import stressDoc from '../tests/fixtures/stress.md?raw';

// ------------------------------------------------------------------ state --

interface RenderInfo {
  rtlBlocks: number;
  totalBlocks: number;
  elapsedMs: number;
  stats: DocumentStats | null;
  /** null when spell checking is off or has not run for this document. */
  misspellings: number | null;
}

const docs = new DocumentSet();
const info: RenderInfo = {
  rtlBlocks: 0,
  totalBlocks: 0,
  elapsedMs: 0,
  stats: null,
  misspellings: null,
};

const active = () => docs.active;
const isDirty = () => {
  const tab = active();
  return tab !== null && docs.isDirty(tab);
};

let host: Host;
let titleBar: TitleBar;
let outline: Outline | null = null;
let folders: FolderPanel | null = null;
let folderOpen = false;
let finder: FindController | null = null;
let editor: SplitEditor | null = null;

let editorOpen = false;
let outlineOpen = false;
let findOpen = false;
let renderTimer: number | undefined;
let autoSaveTimer: number | undefined;
let spellTimer: number | undefined;
let spellAnnounced = false;

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

const el = {
  root: document.documentElement,
  titlebar: document.getElementById('titlebar')!,
  tabstrip: document.getElementById('tabstrip')!,
  toolbar: document.getElementById('toolbar')!,
  body: document.getElementById('body')!,
  statusbar: document.getElementById('statusbar')!,
};

const currentTheme = (): 'light' | 'dark' => {
  const theme = store.current.theme;
  if (theme !== 'auto') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// ------------------------------------------------------------------ tabs ---

function renderTabs(): void {
  // One document needs no tab strip; showing it would just eat a row.
  const show = docs.count > 1;
  el.tabstrip.hidden = !show;
  if (!show) {
    el.tabstrip.innerHTML = '';
    return;
  }

  el.tabstrip.innerHTML = docs.all
    .map(
      (tab) => `<div class="tab${tab.id === active()?.id ? ' tab--active' : ''}"
        data-id="${tab.id}" title="${escapeAttr(tab.path)}">
        <button class="tab__label" dir="${tab.dir}">
          ${docs.isDirty(tab) ? `<span class="tab__dot" title="${t('tabs.unsavedTitle')}"></span>` : ''}
          <span class="tab__name">${escapeHtml(tab.name)}</span>
        </button>
        <button class="tab__close" data-close="${tab.id}" title="${t('tabs.close')}"
          aria-label="${t('tabs.close')}">${icon(ICONS.close, 11)}</button>
      </div>`,
    )
    .join('');

  el.tabstrip.addEventListener('click', onTabStripClick);
  el.tabstrip.addEventListener('auxclick', onTabStripAux);
}

function onTabStripClick(event: MouseEvent): void {
  const closeBtn = (event.target as Element).closest<HTMLElement>('[data-close]');
  if (closeBtn) {
    event.stopPropagation();
    void closeTab(closeBtn.dataset.close!);
    return;
  }
  const tab = (event.target as Element).closest<HTMLElement>('[data-id]');
  if (tab) switchTo(tab.dataset.id!);
}

/** Middle-click closes a tab, as it does in every browser. */
function onTabStripAux(event: MouseEvent): void {
  if (event.button !== 1) return;
  const tab = (event.target as Element).closest<HTMLElement>('[data-id]');
  if (!tab) return;
  event.preventDefault();
  void closeTab(tab.dataset.id!);
}

function rememberScroll(): void {
  const tab = active();
  const preview = el.body.querySelector<HTMLElement>('.preview');
  if (tab && preview) tab.scrollTop = preview.scrollTop;
}

function switchTo(id: string): void {
  if (id === active()?.id) return;
  rememberScroll();
  docs.activate(id);
  if (editor) editor.value = active()?.source ?? '';
  renderAll();
  const preview = el.body.querySelector<HTMLElement>('.preview');
  if (preview) preview.scrollTop = active()?.scrollTop ?? 0;
}

async function closeTab(id: string): Promise<void> {
  const tab = docs.all.find((x) => x.id === id);
  if (!tab) return;

  // Never discard someone's work without asking.
  if (docs.isDirty(tab) && !window.confirm(t('tabs.confirmClose', { name: tab.name }))) return;

  docs.close(id);
  docs.saveSession(store.current.restoreSession);
  if (docs.count === 0) await host.unwatchAll().catch(() => undefined);
  else await rewatch();
  renderAll();
}

// ---------------------------------------------------------------- toolbar --

const themeIcon = () =>
  store.current.theme === 'light'
    ? ICONS.sun
    : store.current.theme === 'dark'
      ? ICONS.moon
      : ICONS.auto;

function buildToolbar(): void {
  const s = store.current;
  const hasDoc = active() !== null;
  const canSave = hasDoc && host.canSave && isDirty();

  el.toolbar.innerHTML = `
    <button class="btn" id="btn-open" title="${t('toolbar.openTitle')}">
      ${icon(ICONS.open)}<span>${t('toolbar.open')}</span>
    </button>
    <button class="btn" id="btn-reload" title="${t('toolbar.reloadTitle')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.refresh)}</button>
    <!-- With a single document the tab strip is hidden, so this is the only
         visible way back to the start screen. -->
    <button class="btn btn--danger" id="btn-close-doc" title="${t('toolbar.closeDocTitle')}"
      aria-label="${t('toolbar.closeDoc')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.close)}</button>

    <span class="toolbar__sep"></span>

    <button class="btn${folderOpen ? ' btn--on' : ''}" id="btn-folder"
      title="${host.canBrowseFolders ? t('folder.open') : t('folder.unavailable')}"
      ${host.canBrowseFolders ? '' : 'disabled'}>${icon(ICONS.folder)}</button>
    <button class="btn${outlineOpen ? ' btn--on' : ''}" id="btn-outline"
      title="${t('outline.toggle')}" aria-pressed="${outlineOpen}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.outline)}</button>
    <button class="btn${findOpen ? ' btn--on' : ''}" id="btn-find"
      title="${t('find.open')}" aria-pressed="${findOpen}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.search)}</button>

    <span class="toolbar__sep"></span>

    <button class="btn${editorOpen ? ' btn--on' : ''}" id="btn-edit"
      title="${t('toolbar.editTitle')}" aria-pressed="${editorOpen}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.edit)}</button>
    <button class="btn" id="btn-save"
      title="${host.canSave ? t('toolbar.saveTitle') : t('toolbar.saveUnavailable')}"
      ${canSave ? '' : 'disabled'}>${icon(ICONS.save)}</button>
    <button class="btn" id="btn-persian" title="${t('persian.fixTitle')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.persian)}</button>

    <div class="toolbar__spacer"></div>

    <div class="segmented" role="group" aria-label="${t('toolbar.directionGroup')}">
      <button class="btn btn--seg${s.directionMode === 'auto' ? ' btn--on' : ''}" id="btn-dir-auto"
        title="${t('toolbar.dirAutoTitle')}">${t('toolbar.dirAuto')}</button>
      <button class="btn btn--seg${s.directionMode === 'rtl' ? ' btn--on' : ''}" id="btn-dir-rtl"
        title="${t('toolbar.dirRtlTitle')}">${t('toolbar.dirRtl')}</button>
      <button class="btn btn--seg${s.directionMode === 'ltr' ? ' btn--on' : ''}" id="btn-dir-ltr"
        title="${t('toolbar.dirLtrTitle')}">${t('toolbar.dirLtr')}</button>
    </div>

    <div class="toolbar__spacer"></div>

    <button class="btn" id="btn-copy" title="${t('copy.richTitle')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.copy)}</button>
    <button class="btn" id="btn-export" title="${t('export.html')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.export)}</button>
    <button class="btn" id="btn-docx" title="${t('export.docx')} — ${t('export.docxHint')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.word)}</button>
    <button class="btn" id="btn-print" title="${t('export.print')}"
      ${hasDoc ? '' : 'disabled'}>${icon(ICONS.print)}</button>

    <span class="toolbar__sep"></span>

    <button class="btn" id="btn-zoom-out" title="${t('toolbar.zoomOut')}">${icon(ICONS.zoomOut)}</button>
    <button class="btn btn--zoom" id="btn-zoom-reset" title="${t('toolbar.zoomReset')}">
      <span>${zoomLabel()}</span>
    </button>
    <button class="btn" id="btn-zoom-in" title="${t('toolbar.zoomIn')}">${icon(ICONS.zoomIn)}</button>
    <button class="btn" id="btn-theme" title="${t('toolbar.theme')}">${icon(themeIcon())}</button>
    <button class="btn" id="btn-settings" title="${t('toolbar.settings')}">${icon(ICONS.settings)}</button>
  `;

  on('btn-open', () => void openFile());
  on('btn-reload', () => void reloadFromDisk());
  on('btn-close-doc', () => {
    const id = active()?.id;
    if (id) void closeTab(id);
  });
  on('btn-outline', toggleOutline);
  on('btn-find', () => toggleFind());
  on('btn-edit', toggleEditor);
  on('btn-save', () => void saveFile());
  on('btn-persian', () => fixPersian());
  on('btn-dir-auto', () => store.set('directionMode', 'auto'));
  on('btn-dir-rtl', () => store.set('directionMode', 'rtl'));
  on('btn-dir-ltr', () => store.set('directionMode', 'ltr'));
  on('btn-copy', () => void doCopyRich());
  on('btn-export', () => void doExport());
  on('btn-docx', () => void doExportDocx());
  on('btn-folder', () => void toggleFolder());
  on('btn-print', () => void doPrint());
  on('btn-zoom-in', () => nudgeZoom(+1));
  on('btn-zoom-out', () => nudgeZoom(-1));
  on('btn-zoom-reset', () => store.set('zoom', 1));
  on('btn-theme', cycleTheme);
  on('btn-settings', () => openSettings(renderAll, checkForUpdate, (url) => void requestExternalLink(url)));
}

function on(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener('click', handler);
}

const zoomLabel = () => `${localiseDigits(Math.round(store.current.zoom * 100))}%`;

function nudgeZoom(direction: 1 | -1): void {
  store.set('zoom', store.current.zoom + direction * RANGES.zoom.step);
}

function cycleTheme(): void {
  const order = ['auto', 'light', 'dark'] as const;
  store.set('theme', order[(order.indexOf(store.current.theme) + 1) % order.length]!);
}

// ------------------------------------------------------------ file access --

async function openFile(): Promise<void> {
  try {
    const file = await host.pickFile();
    if (file) await adoptDocument(file);
  } catch (error) {
    reportHostError(error);
  }
}

async function openPath(path: string, quiet = false): Promise<boolean> {
  try {
    await adoptDocument(await host.readFile(path));
    return true;
  } catch (error) {
    if (!quiet) reportHostError(error);
    return false;
  }
}

async function adoptDocument(file: OpenedDocument): Promise<void> {
  rememberScroll();
  docs.open({ path: file.path, name: file.name || baseName(file.path), content: file.content });
  if (editor) editor.value = active()?.source ?? '';
  rememberRecent(file.path, file.name || baseName(file.path));
  docs.saveSession(store.current.restoreSession);
  await rewatch();
  renderAll();
}

async function reloadFromDisk(): Promise<void> {
  const tab = active();
  if (!tab?.path) return;
  if (docs.isDirty(tab) && !window.confirm(t('dialog.discardChanges'))) return;
  tab.saved = tab.source; // clear the dirty flag so open() refreshes it
  await openPath(tab.path);
}

async function saveFile(): Promise<void> {
  const tab = active();
  if (!tab || !host.canSave) return;
  try {
    await host.writeFile(tab.path, tab.source);
    tab.saved = tab.source;
    tab.staleOnDisk = false;
    toast(t('toast.saved', { name: tab.name }));
    renderChrome();
  } catch (error) {
    reportHostError(error);
  }
}

/** Auto-save fires a few seconds after typing stops, never mid-keystroke. */
function scheduleAutoSave(): void {
  window.clearTimeout(autoSaveTimer);
  if (!store.current.autoSave || !host.canSave) return;
  autoSaveTimer = window.setTimeout(() => {
    if (isDirty()) void saveFile();
  }, 2500);
}

async function rewatch(): Promise<void> {
  await host.unwatchAll().catch(() => undefined);
  if (!store.current.liveReload) return;

  // Watch every open document, not just the visible one: a background tab
  // going stale matters the moment you switch to it.
  for (const tab of docs.all) {
    if (!tab.path || tab.path.startsWith('tests/')) continue;
    await host
      .watch(tab.path, () => {
        if (docs.isDirty(tab)) {
          tab.staleOnDisk = true;
          renderChrome();
          if (tab.id === active()?.id) toast(t('toast.fileChangedDirty'));
          return;
        }
        if (tab.id === active()?.id) toast(t('toast.fileChanged'));
        void openPath(tab.path, true);
      })
      .catch(() => undefined);
  }
}

function reportHostError(error: unknown): void {
  const { key, vars } = describeHostError(error);
  toast(t(key, vars));
}

// ----------------------------------------------------------- recent files --

const RECENT_KEY = 'b-mark.recent';
const RECENT_MAX = 8;

interface RecentEntry {
  path: string;
  name: string;
}

function readRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          typeof e === 'object' && e !== null && typeof (e as RecentEntry).path === 'string',
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function rememberRecent(path: string, name: string): void {
  if (path.startsWith('tests/')) return;
  try {
    const list = [{ path, name }, ...readRecent().filter((e) => e.path !== path)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode; recents simply do not persist */
  }
}

// ----------------------------------------------------------- Persian tools --

/**
 * Run the Persian fixes over the buffer.
 *
 * Only ever touches the source, never the rendered output, and only in editor
 * mode — rewriting a file the user is merely reading would be startling.
 */
function fixPersian(): void {
  const tab = active();
  if (!tab) return;

  const s = store.current;
  const report = fixPersianText(tab.source, {
    normaliseLetters: s.fixLetters,
    fixZwnj: s.fixZwnj,
    fixPunctuationSpacing: s.fixPunctuationSpacing,
    normalisePunctuation: s.fixPunctuation,
    digits: s.fixDigits,
  });

  if (report.total === 0) {
    toast(t('persian.noChanges'));
    return;
  }

  tab.source = report.text;
  if (editor) editor.value = report.text;

  const rules = Object.keys(report.counts)
    .map((k) => t(`persian.rules.${k}`))
    .join('، ');
  toast(t('persian.fixed', { n: localiseDigits(report.total), rules }));

  renderPreview();
  renderChrome();
  scheduleAutoSave();
}

// ------------------------------------------------------------------ panels --

function toggleOutline(): void {
  outlineOpen = !outlineOpen;
  renderAll();
}

function toggleFind(force?: boolean): void {
  findOpen = force ?? !findOpen;
  if (!findOpen) finder?.clear();
  renderAll();
  if (findOpen) {
    const input = document.getElementById('find-input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
}

function toggleEditor(): void {
  if (!active()) return;
  editorOpen = !editorOpen;
  renderAll();
  if (editorOpen) editor?.focus();
}

function scheduleRender(): void {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderPreview, 120);
}

// -------------------------------------------------------- copy and export --

function contentEl(): HTMLElement | null {
  return el.body.querySelector<HTMLElement>('.content');
}

async function doCopyRich(): Promise<void> {
  const content = contentEl();
  if (!content) return;
  const result = await copyAsRichText(content);
  toast(result.html ? t('copy.richDone') : t('copy.failed'));
}

async function doCopyMarkdown(): Promise<void> {
  const tab = active();
  if (!tab) return;
  toast((await copyAsMarkdown(tab.source)) ? t('copy.markdownDone') : t('copy.failed'));
}

async function doExport(): Promise<void> {
  const content = contentEl();
  if (!content) return;
  try {
    const name = await exportHtml({ title: active()?.name ?? 'document', content });
    if (name) toast(t('export.done', { name }));
  } catch (error) {
    console.error('[b-mark] HTML export failed:', error);
    toast(t('export.failed'));
  }
}

/**
 * Check for an update. Only ever on an explicit click — there is no timer and
 * no startup check, because a program that contacts a server on its own is
 * precisely what this project promises not to be.
 */
async function checkForUpdate(): Promise<void> {
  if (!host.canUpdate) {
    toast(t('update.unconfigured'));
    return;
  }
  toast(t('update.checking'));
  try {
    const found = await host.checkForUpdate();
    if (!found) {
      toast(t('update.none'));
      return;
    }
    if (window.confirm(t('update.available', { version: found.version }))) {
      await host.installUpdate();
    }
  } catch {
    toast(t('update.failed'));
  }
}

async function doExportDocx(): Promise<void> {
  const content = contentEl();
  if (!content) return;
  try {
    const name = await exportDocx({ title: active()?.name ?? 'document', content });
    // null means the user cancelled the save dialog — not a success, and not
    // an error either, so say nothing.
    if (name) toast(t('export.done', { name }));
  } catch (error) {
    console.error('[b-mark] DOCX export failed:', error);
    toast(t('export.failed'));
  }
}

async function toggleFolder(): Promise<void> {
  if (!host.canBrowseFolders) {
    toast(t('folder.unavailable'));
    return;
  }
  if (folderOpen) {
    folderOpen = false;
    renderAll();
    return;
  }
  const dir = await host.pickFolder();
  if (!dir) return;
  folderOpen = true;
  renderAll();
  await folders?.show(dir);
}

async function doPrint(): Promise<void> {
  const content = contentEl();
  if (!content) return;
  try {
    await printDocument({ title: active()?.name ?? 'document', content });
  } catch {
    toast(t('export.failed'));
  }
}

// ----------------------------------------------------------------- render --

/** Chrome only — cheap, and safe to call on every keystroke. */
function renderChrome(): void {
  buildToolbar();
  renderTabs();
  titleBar.render({ documentName: active()?.name ?? null, dirty: isDirty() });
  renderStatus();
}

function renderAll(): void {
  renderChrome();

  if (!active()) {
    editorOpen = outlineOpen = findOpen = false;
    editor?.unmount();
    editor = null;
    outline?.destroy();
    outline = null;
    finder = null;
    renderEmptyState();
    renderStatus();
    return;
  }

  buildWorkspace();
  renderPreview();
}

function buildWorkspace(): void {
  let preview = el.body.querySelector<HTMLElement>('.preview');

  if (!preview) {
    el.body.replaceChildren();

    const folderAside = document.createElement('aside');
    folderAside.id = 'folders';
    el.body.appendChild(folderAside);
    folders = new FolderPanel(folderAside, host, (path) => void openPath(path));
    folderAside.addEventListener('folders:close', () => {
      folderOpen = false;
      renderAll();
    });

    const aside = document.createElement('aside');
    aside.id = 'outline';
    el.body.appendChild(aside);

    preview = document.createElement('div');
    preview.className = 'preview';
    const content = document.createElement('article');
    content.className = 'content';
    preview.appendChild(content);
    el.body.appendChild(preview);

    bindLinks(content);
    outline = new Outline(aside);
    finder = new FindController(content, preview);
  }

  el.body.classList.toggle('body--folders', folderOpen);
  el.body.classList.toggle('body--outline', outlineOpen);
  el.body.classList.toggle('body--split', editorOpen);

  if (editorOpen && !editor) {
    editor = new SplitEditor({
      onInput: (value) => {
        const tab = active();
        if (!tab) return;
        tab.source = value;
        scheduleRender();
        scheduleAutoSave();
        renderChrome();
      },
      onSaveRequest: () => void saveFile(),
    });
  } else if (!editorOpen && editor) {
    editor.unmount();
    editor = null;
  }
  if (editor && !editor.element) {
    editor.mount(el.body, active()?.source ?? '');
    editor.bindScrollSync(preview);
  }

  renderFindBar();
}

function renderFindBar(): void {
  const existing = document.getElementById('find-bar');
  if (!findOpen) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const bar = document.createElement('div');
  bar.id = 'find-bar';
  bar.className = 'find-bar';
  bar.setAttribute('dir', uiDirection());
  bar.innerHTML = `
    <span class="find-bar__icon">${icon(ICONS.search, 14)}</span>
    <input type="search" id="find-input" class="find-bar__input" dir="auto"
      placeholder="${t('find.placeholder')}" aria-label="${t('find.placeholder')}"
      title="${t('find.hint')}" autocomplete="off" spellcheck="false">
    <span class="find-bar__count" id="find-count"></span>
    <button class="btn find-bar__btn" id="find-prev" title="${t('find.previous')}">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4-4 4 4"/></svg>
    </button>
    <button class="btn find-bar__btn" id="find-next" title="${t('find.next')}">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    <button class="btn find-bar__btn" id="find-close" title="${t('find.close')}">${icon(ICONS.close, 14)}</button>
  `;
  el.body.appendChild(bar);

  const input = bar.querySelector<HTMLInputElement>('#find-input')!;
  const count = bar.querySelector<HTMLElement>('#find-count')!;

  const show = (r: { total: number; current: number }) => {
    count.textContent =
      input.value.trim().length === 0
        ? ''
        : r.total === 0
          ? t('find.none')
          : t('find.count', {
              current: localiseDigits(r.current),
              total: localiseDigits(r.total),
            });
    count.classList.toggle('find-bar__count--none', input.value.trim().length > 0 && r.total === 0);
  };

  input.addEventListener('input', () => show(finder!.search(input.value)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      show(e.shiftKey ? finder!.previous() : finder!.next());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleFind(false);
    }
  });
  bar.querySelector('#find-prev')?.addEventListener('click', () => show(finder!.previous()));
  bar.querySelector('#find-next')?.addEventListener('click', () => show(finder!.next()));
  bar.querySelector('#find-close')?.addEventListener('click', () => toggleFind(false));
}

function renderPreview(): void {
  const s = store.current;
  const tab = active();
  const content = contentEl();
  const preview = el.body.querySelector<HTMLElement>('.preview');
  if (!content || !preview || !tab) return;

  const options: PipelineOptions = {
    mode: s.directionMode,
    // The fallback is what a block with no strong character at all resolves
    // to — a numeric table cell, a line of punctuation, a code-only
    // paragraph. Hard-coding it to LTR meant a Persian reader opening a
    // mostly-numeric document got a left-aligned page even with the mode on
    // Auto. Following the interface language is what "automatic" should mean
    // for someone who has told us they read Persian.
    fallback: uiDirection(),
    codeFollowsProse: s.codeFollowsProse,
    syntaxHighlight: s.syntaxHighlight,
    allowRawHtml: s.rawHtml,
    math: s.math,
    diagrams: s.diagrams,
    showFrontMatter: s.showFrontMatter,
    linkify: true,
  };

  const scrollTop = preview.scrollTop;
  const result = renderInto(content, tab.source, options);
  preview.scrollTop = scrollTop;

  info.rtlBlocks = result.rtlBlocks;
  info.elapsedMs = result.elapsedMs;
  info.totalBlocks = content.querySelectorAll('[data-bmark-dir]').length;

  // The document style is applied before the measurements are taken, so the
  // status bar reports what is actually on screen.
  applyContentTheme(content, s.contentTheme, {
    '--content-font-size': `${s.fontSize * s.zoom}px`,
    '--content-line-height': String(s.lineHeight),
    '--paragraph-spacing': `${s.paragraphSpacing}em`,
    '--content-max-width': `${s.contentWidth}px`,
  });

  applyImagePolicy(content);
  attachCodeCopyButtons(content);
  attachImageZoom(content);
  info.stats = analyse(content);

  if (outlineOpen) outline?.update(content, preview);
  folders?.setActive(tab.path);
  finder?.clear();
  scheduleSpellCheck(content);
  renderStatus();

  // KaTeX and Mermaid are multi-megabyte; the document is on screen before
  // either is fetched, and a document containing neither fetches nothing.
  if (result.needsMath || result.needsDiagrams) {
    void enhance(content, {
      math: result.needsMath,
      diagrams: result.needsDiagrams,
      theme: currentTheme(),
    }).then(() => {
      attachImageZoom(content);
      if (outlineOpen) outline?.update(content, preview);
    });
  }
}

/**
 * Spell check, debounced.
 *
 * Building the Persian dictionary costs a couple of seconds and a lot of
 * heap, so this never runs while someone is typing, and never at all unless
 * the setting is on. The first run says so, because a two-second silence
 * after switching a feature on reads as "it did nothing" — which is exactly
 * what the switch used to do.
 */
function scheduleSpellCheck(content: HTMLElement): void {
  window.clearTimeout(spellTimer);
  clearSpellHighlights();

  if (!store.current.spellCheck) {
    // Give back the ~172 MB the Persian dictionary holds, but only on the
    // transition — not on every render while the feature is simply off.
    if (spellAnnounced) {
      spellAnnounced = false;
      releaseDictionaries();
    }
    info.misspellings = null;
    return;
  }

  const announce = !spellAnnounced;
  spellTimer = window.setTimeout(() => {
    if (announce) {
      spellAnnounced = true;
      toast(t('spell.loading'));
    }
    void highlightMisspellings(content)
      .then((run) => {
        info.misspellings = run.count;
        if (!run.painted && run.count > 0) toast(t('spell.unsupported'));
        renderStatus();
      })
      .catch((error) => {
        console.error('[b-mark] spell check failed:', error);
        info.misspellings = null;
        toast(t('spell.failed'));
        renderStatus();
      });
  }, 600);
}

function applyImagePolicy(content: HTMLElement): void {
  const allow = store.current.externalImages;
  for (const img of Array.from(content.querySelectorAll<HTMLImageElement>('img[data-remote]'))) {
    const src = img.getAttribute('data-src');
    if (allow && src) img.setAttribute('src', src);
    else img.removeAttribute('src');
  }
}

function renderEmptyState(): void {
  const dir = uiDirection();
  const recent = readRecent();

  el.body.className = 'body';
  el.body.innerHTML = `
    <div class="empty">
      <div class="empty__logo">${iconPlate(96, 24)}</div>
      <h1 class="empty__title">${t('app.name')}</h1>
      <!-- Visible on the very first screen, deliberately: when a fix appears
           not to have landed, the first question is always which build is
           running, and until now nothing on screen answered it. -->
      <div class="empty__version">${t('about.version', {
        version: localiseDigits(APP_VERSION),
      })}</div>
      <p class="empty__hint" dir="${dir}">${t('empty.hint')}</p>
      <button class="btn btn--primary" id="btn-empty-open">${t('empty.openButton')}</button>

      ${
        recent.length > 0
          ? `<div class="recent">
               <div class="recent__head">${t('recent.title')}</div>
               ${recent
                 .map(
                   (r) => `<button class="recent__item" data-path="${escapeAttr(r.path)}"
                     title="${escapeAttr(r.path)}">
                     ${brandMark(13)}<span>${escapeHtml(r.name)}</span>
                   </button>`,
                 )
                 .join('')}
               <button class="btn btn--ghost" id="recent-clear">${t('recent.clear')}</button>
             </div>`
          : ''
      }

      <div class="empty__keys">
        <kbd>Ctrl</kbd><kbd>O</kbd><span class="empty__sep">${t('empty.keyOpen')}</span>
        <kbd>Ctrl</kbd><kbd>F</kbd><span class="empty__sep">${t('toolbar.find')}</span>
        <kbd>Ctrl</kbd><kbd>0</kbd><span class="empty__sep">${t('empty.keyZoom')}</span>
      </div>
      <button class="btn btn--ghost" id="btn-empty-sample">${t('empty.sample')}</button>
    </div>`;

  on('btn-empty-open', () => void openFile());
  on('btn-empty-sample', () => {
    void adoptDocument({
      path: 'tests/fixtures/stress.md',
      name: 'stress.md',
      dir: '',
      content: stressDoc,
      bytes: stressDoc.length,
      modifiedMs: Date.now(),
    });
  });
  document.getElementById('recent-clear')?.addEventListener('click', () => {
    localStorage.removeItem(RECENT_KEY);
    renderEmptyState();
  });
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>('.recent__item'))) {
    btn.addEventListener('click', () => void openPath(btn.dataset.path!));
  }
}

function bindLinks(content: HTMLElement): void {
  content.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor) return;
    event.preventDefault();

    const internal = anchor.getAttribute('data-anchor');
    if (internal) {
      const target =
        content.querySelector(`#${cssEscape(internal)}`) ??
        content.querySelector(`#${cssEscape(encodeURIComponent(internal))}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const external = anchor.getAttribute('data-external');
    if (external) void requestExternalLink(external);
  });
}

async function requestExternalLink(url: string): Promise<void> {
  if (store.current.confirmLinks && !window.confirm(`${t('dialog.openExternal')}\n\n${url}`)) return;
  try {
    await host.openExternal(url);
  } catch {
    toast(t('toast.linkBlocked'));
  }
}

function renderStatus(): void {
  const s = store.current;
  const tab = active();

  if (!tab) {
    el.statusbar.innerHTML = `
      <span class="statusbar__path">${t('status.noFile')}</span>
      <span class="statusbar__item">${t('status.theme', { theme: t(`settings.theme.${s.theme}`) })}</span>`;
    return;
  }

  const flags: string[] = [];
  if (docs.isDirty(tab))
    flags.push(`<span class="statusbar__item statusbar__item--warn">${t('status.unsaved')}</span>`);
  if (tab.staleOnDisk)
    flags.push(`<span class="statusbar__item statusbar__item--warn">${t('status.modified')}</span>`);

  const st = info.stats;
  const detail = st
    ? t('stats.detail', {
        words: localiseDigits(st.words),
        chars: localiseDigits(st.characters),
        headings: localiseDigits(st.headings),
        code: localiseDigits(st.codeBlocks),
        tables: localiseDigits(st.tables),
        images: localiseDigits(st.images),
      })
    : '';

  el.statusbar.innerHTML = `
    <span class="statusbar__path" title="${escapeAttr(tab.path)}">${escapeHtml(tab.path)}</span>
    ${flags.join('')}
    ${
      st
        ? `<span class="statusbar__item" title="${escapeAttr(detail)}">${t('stats.words', {
            n: localiseDigits(st.words),
          })}</span>
           <span class="statusbar__item" title="${escapeAttr(detail)}">${t('stats.readingTime', {
             n: localiseDigits(st.readingMinutes),
           })}</span>`
        : ''
    }
    <span class="statusbar__item">${t('status.blocks', {
      rtl: localiseDigits(info.rtlBlocks),
      total: localiseDigits(info.totalBlocks),
    })}</span>
    ${
      info.misspellings !== null
        ? `<span class="statusbar__item${info.misspellings > 0 ? ' statusbar__item--warn' : ''}">${t(
            info.misspellings > 0 ? 'spell.count' : 'spell.clean',
            { n: localiseDigits(info.misspellings) },
          )}</span>`
        : ''
    }
    <span class="statusbar__item">${t('status.direction', {
      mode: t(`settings.directionMode.${s.directionMode}`),
    })}</span>
    <span class="statusbar__item">${zoomLabel()}</span>`;
}

// ------------------------------------------------------------------ toast --

let toastTimer: number | undefined;

function toast(message: string): void {
  let node = document.getElementById('toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.setAttribute('dir', uiDirection());
  node.textContent = message;
  node.classList.add('toast--visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node?.classList.remove('toast--visible'), 4500);
}

// ----------------------------------------------------------- context menu --

function bindContextMenu(): void {
  window.addEventListener('contextmenu', (event) => {
    if ((event.target as Element | null)?.closest('.editor__input, .find-bar')) return;

    event.preventDefault();
    const target = event.target as Element | null;
    const anchor = target?.closest('a');
    const tab = active();

    openContextMenu(
      event,
      {
        target,
        hasSelection: (window.getSelection()?.toString() ?? '').length > 0,
        linkHref: anchor?.getAttribute('data-external') ?? null,
        hasFile: tab !== null,
        canRevealFolder: host.kind === 'tauri' && (tab?.path ?? '') !== '',
      },
      {
        copy: () => void navigator.clipboard?.writeText(window.getSelection()?.toString() ?? ''),
        copyRich: () => void doCopyRich(),
        copyMarkdown: () => void doCopyMarkdown(),
        fixPersian,
        selectAll: () => {
          const content = contentEl();
          if (!content) return;
          const range = document.createRange();
          range.selectNodeContents(content);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        },
        openLink: (href) => void requestExternalLink(href),
        copyLink: (href) => {
          void navigator.clipboard?.writeText(href);
          toast(t('toast.copied'));
        },
        openFolder: () => {
          host.revealInFolder(tab?.path ?? '').catch(() => toast(t('toast.revealUnavailable')));
        },
        find: () => toggleFind(true),
        outline: toggleOutline,
        exportHtml: () => void doExport(),
        exportDocx: () => void doExportDocx(),
        print: () => void doPrint(),
        reload: () => void reloadFromDisk(),
        zoomIn: () => nudgeZoom(+1),
        zoomOut: () => nudgeZoom(-1),
        zoomReset: () => store.set('zoom', 1),
        settings: () => openSettings(renderAll, checkForUpdate, (url) => void requestExternalLink(url)),
      },
    );
  });
}

// -------------------------------------------------------------- shortcuts --

function bindShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContextMenu();
      if (isLightboxOpen()) closeLightbox();
      else if (isSettingsOpen()) closeSettings();
      else if (findOpen) toggleFind(false);
      else {
        void host.isFullscreen().then((on) => {
          if (on) void host.setFullscreen(false);
        });
      }
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      void host.isFullscreen().then((on) => host.setFullscreen(!on));
      return;
    }

    if (!e.ctrlKey && !e.metaKey) return;

    // Ctrl+Tab cycles documents, as in a browser.
    if (e.key === 'Tab') {
      e.preventDefault();
      rememberScroll();
      docs.cycle(e.shiftKey ? -1 : 1);
      if (editor) editor.value = active()?.source ?? '';
      renderAll();
      return;
    }

    if (e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        toggleOutline();
      } else if (key === 'p') {
        e.preventDefault();
        fixPersian();
      } else if (key === 'c') {
        e.preventDefault();
        void doCopyRich();
      } else if (e.code === 'Space') {
        // Insert a ZWNJ at the caret — the single most-typed Persian
        // character that no keyboard layout puts anywhere convenient.
        e.preventDefault();
        insertAtCaret(ZWNJ_CHAR);
      }
      return;
    }

    // Ctrl+1..9 jumps to a tab.
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      rememberScroll();
      if (docs.activateByIndex(Number(e.key))) {
        if (editor) editor.value = active()?.source ?? '';
        renderAll();
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'o':
        e.preventDefault();
        void openFile();
        break;
      case 'w':
        e.preventDefault();
        if (active()) void closeTab(active()!.id);
        break;
      case 's':
        e.preventDefault();
        void saveFile();
        break;
      case 'e':
        e.preventDefault();
        toggleEditor();
        break;
      case 'f':
        e.preventDefault();
        toggleFind(true);
        break;
      case 'p':
        e.preventDefault();
        void doPrint();
        break;
      case ',':
        e.preventDefault();
        openSettings(renderAll, checkForUpdate, (url) => void requestExternalLink(url));
        break;
      case '=':
      case '+':
        e.preventDefault();
        nudgeZoom(+1);
        break;
      case '-':
        e.preventDefault();
        nudgeZoom(-1);
        break;
      case '0':
        e.preventDefault();
        store.set('zoom', 1);
        break;
      case 'r':
        e.preventDefault();
        void reloadFromDisk();
        break;
    }
  });
}

function insertAtCaret(text: string): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLInputElement)) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)) {
    // Native path keeps the undo stack intact.
  } else {
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindUnloadGuard(): void {
  window.addEventListener('beforeunload', (e) => {
    docs.saveSession(store.current.restoreSession);
    if (!docs.anyDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

// ------------------------------------------------------------------- boot --

function setFavicon(): void {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = faviconUrl;
  document.head.appendChild(link);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/**
 * `CSS.escape` exists in every browser B mark targets, but a click handler
 * that throws leaves the UI wedged, so fall back rather than assume.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^\w-]/g, (c) => `\\${c}`);
}

/** Reopen the documents that were open last time, by path. */
async function restoreSession(): Promise<void> {
  if (!store.current.restoreSession) return;
  const session = DocumentSet.readSession();
  if (session.paths.length === 0) return;

  let restored = 0;
  let missing = 0;
  for (const path of session.paths) {
    // Quiet: a file that has moved should produce one summary, not a stack of
    // error toasts on every launch.
    if (await openPath(path, true)) restored++;
    else missing++;
  }

  if (session.active) {
    const tab = docs.all.find((x) => x.path === session.active);
    if (tab) docs.activate(tab.id);
  }

  if (restored > 0) toast(t('tabs.restored', { n: localiseDigits(restored) }));
  if (missing > 0) toast(t('tabs.restoreFailed', { n: localiseDigits(missing) }));
}

async function boot(): Promise<void> {
  setFavicon();

  host = await initHost();
  document.documentElement.setAttribute('data-host', host.kind);
  document.body.classList.toggle('has-window-controls', host.hasWindowControls);

  titleBar = new TitleBar(host, el.titlebar);

  await store.load();

  let lastLiveReload = store.current.liveReload;
  let lastTheme = currentTheme();
  store.subscribe((settings) => {
    if (settings.liveReload !== lastLiveReload) {
      lastLiveReload = settings.liveReload;
      void rewatch();
    }
    // Mermaid bakes its colours into the SVG, so a theme change needs a
    // re-render rather than a restyle.
    const theme = currentTheme();
    if (theme !== lastTheme) {
      lastTheme = theme;
      void import('./markdown/diagrams').then((m) => m.invalidateDiagramTheme());
    }
    renderAll();
  });

  host.onOpenRequest((paths) => {
    for (const p of paths) void openPath(p);
  });
  host.onFileDrop((paths) => {
    for (const p of paths) void openPath(p);
  });

  bindShortcuts();
  bindContextMenu();
  bindUnloadGuard();

  renderAll();
  await restoreSession();
  renderAll();
}

void boot();
