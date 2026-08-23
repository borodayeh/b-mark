/**
 * Settings panel.
 *
 * Every control is bound to the store, so changes are live and persisted the
 * moment they happen — there is no Apply/OK to forget. Rendering is a full
 * rebuild of the panel body on each change: with ~20 controls that is far
 * cheaper than fine-grained bindings and removes a whole class of
 * out-of-sync-UI bugs.
 */

import { store } from './store';
import {
  ACCENTS,
  FONT_WEIGHTS,
  RANGES,
  type AccentName,
  type DirectionMode,
  type FontChoice,
  type Settings,
  type Theme,
} from './schema';
import { t, LANGUAGES, languageName, localiseDigits, type Language } from '../i18n';
import { iconPlate } from '../components/logo';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const BUILD_STAMP = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';
const REPO_URL = 'https://github.com/borodayeh/b-mark';
const LICENCE_URL = 'https://github.com/borodayeh/b-mark/blob/main/LICENSE';

let overlay: HTMLElement | null = null;
let onChanged: (() => void) | null = null;
let onCheckUpdate: (() => void | Promise<void>) | null = null;
let onOpenLink: ((url: string) => void) | null = null;
let lastFocused: HTMLElement | null = null;

export function isSettingsOpen(): boolean {
  return overlay !== null;
}

export function openSettings(
  onChange: () => void,
  onUpdate?: () => void | Promise<void>,
  onLink?: (url: string) => void,
): void {
  if (overlay) return;
  onChanged = onChange;
  onCheckUpdate = onUpdate ?? null;
  onOpenLink = onLink ?? null;
  lastFocused = document.activeElement as HTMLElement | null;

  overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'settings-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('settings.title'));
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSettings();
  });

  renderPanel();
  overlay.querySelector<HTMLElement>('.panel__close')?.focus();
}

export function closeSettings(): void {
  overlay?.remove();
  overlay = null;
  onChanged = null;
  lastFocused?.focus();
  lastFocused = null;
}

function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
  store.set(key, value);
  renderPanel();
  onChanged?.();
}

// ------------------------------------------------------------- fragments --

function row(label: string, control: string, help?: string): string {
  return `
    <div class="row">
      <div class="row__text">
        <span class="row__label">${label}</span>
        ${help ? `<span class="row__help">${help}</span>` : ''}
      </div>
      <div class="row__control">${control}</div>
    </div>`;
}

function segmented(
  name: string,
  options: Array<{ value: string; label: string; title?: string }>,
  active: string,
): string {
  return `<div class="segmented segmented--wide" data-field="${name}">
    ${options
      .map(
        (o) => `<button class="btn btn--seg${o.value === active ? ' btn--on' : ''}"
          data-value="${o.value}"${o.title ? ` title="${o.title}"` : ''}>${o.label}</button>`,
      )
      .join('')}
  </div>`;
}

function toggle(name: string, on: boolean): string {
  return `<button class="switch${on ? ' switch--on' : ''}" data-field="${name}"
    role="switch" aria-checked="${on}"><span class="switch__knob"></span></button>`;
}

function slider(
  name: string,
  value: number,
  range: { min: number; max: number; step: number },
  display: string,
): string {
  return `<div class="slider">
    <input type="range" data-field="${name}" min="${range.min}" max="${range.max}"
      step="${range.step}" value="${value}" aria-label="${name}">
    <output>${display}</output>
  </div>`;
}

function swatches(active: AccentName): string {
  return `<div class="swatches" data-field="accent">
    ${(Object.keys(ACCENTS) as AccentName[])
      .map(
        (name) => `<button class="swatch${name === active ? ' swatch--on' : ''}"
        data-value="${name}" title="${t(`settings.accent.${name}`)}"
        style="--sw: ${ACCENTS[name].fill}" aria-label="${t(`settings.accent.${name}`)}"></button>`,
      )
      .join('')}
  </div>`;
}

function fontSelect(name: string, value: FontChoice): string {
  const options: FontChoice[] = ['vazirmatn', 'system', 'mono'];
  return `<select class="select" data-field="${name}">
    ${options
      .map(
        (o) =>
          `<option value="${o}"${o === value ? ' selected' : ''}>${t(`settings.fontOptions.${o}`)}</option>`,
      )
      .join('')}
  </select>`;
}

// ---------------------------------------------------------------- render --

function renderPanel(): void {
  if (!overlay) return;
  const s = store.current;
  const n = (v: number | string) => localiseDigits(v);

  overlay.innerHTML = `
  <div class="panel">
    <header class="panel__head">
      <h2 class="panel__title">${t('settings.title')}</h2>
      <button class="btn panel__close" title="${t('settings.close')}" aria-label="${t('settings.close')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      </button>
    </header>

    <div class="panel__body">

      <section class="group">
        <h3 class="group__title">${t('settings.sections.language')}</h3>
        ${row(
          t('settings.language.label'),
          segmented(
            'language',
            LANGUAGES.map((l: Language) => ({ value: l, label: languageName(l) })),
            s.language,
          ),
          t('settings.language.help'),
        )}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.appearance')}</h3>
        ${row(
          t('settings.theme.label'),
          segmented(
            'theme',
            [
              { value: 'light', label: t('settings.theme.light') },
              { value: 'dark', label: t('settings.theme.dark') },
              { value: 'auto', label: t('settings.theme.auto'), title: t('settings.theme.autoHelp') },
            ],
            s.theme,
          ),
        )}
        ${row(t('settings.accent.label'), swatches(s.accent))}
        ${row(
          t('settings.contentWidth.label'),
          slider('contentWidth', s.contentWidth, RANGES.contentWidth, `${n(s.contentWidth)}px`),
          t('settings.contentWidth.help'),
        )}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.typography')}</h3>
        ${row(
          t('settings.fontSize.label'),
          slider('fontSize', s.fontSize, RANGES.fontSize, `${n(s.fontSize)}px`),
        )}
        ${row(
          t('settings.lineHeight.label'),
          slider('lineHeight', s.lineHeight, RANGES.lineHeight, n(s.lineHeight.toFixed(2))),
        )}
        ${row(
          t('settings.paragraphSpacing.label'),
          slider(
            'paragraphSpacing',
            s.paragraphSpacing,
            RANGES.paragraphSpacing,
            `${n(s.paragraphSpacing.toFixed(1))}em`,
          ),
        )}
        ${row(
          t('settings.fontWeight.label'),
          segmented(
            'fontWeight',
            FONT_WEIGHTS.map((w) => ({ value: String(w), label: t(`settings.fontWeight.${w}`) })),
            String(s.fontWeight),
          ),
        )}
        ${row(t('settings.uiFont.label'), fontSelect('uiFont', s.uiFont))}
        ${row(t('settings.contentFont.label'), fontSelect('contentFont', s.contentFont))}
        ${row(
          t('settings.codeFont.label'),
          fontSelect('codeFont', s.codeFont),
          t('settings.codeFont.help'),
        )}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.text')}</h3>
        ${row(
          t('settings.directionMode.label'),
          segmented(
            'directionMode',
            [
              { value: 'auto', label: t('settings.directionMode.auto') },
              { value: 'rtl', label: t('settings.directionMode.rtl') },
              { value: 'ltr', label: t('settings.directionMode.ltr') },
            ],
            s.directionMode,
          ),
          t('settings.directionMode.help'),
        )}
        ${row(
          t('settings.codeDirection.label'),
          toggle('codeFollowsProse', s.codeFollowsProse),
          t('settings.codeDirection.help'),
        )}
        ${row(t('settings.syntaxHighlight.label'), toggle('syntaxHighlight', s.syntaxHighlight))}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.document')}</h3>
        ${row(
          t('contentTheme.label'),
          segmented(
            'contentTheme',
            (['default', 'academic', 'book', 'compact'] as const).map((v) => ({
              value: v,
              label: t(`contentTheme.${v}`),
            })),
            s.contentTheme,
          ),
          t('contentTheme.help'),
        )}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.persian')}</h3>
        ${row(t('spell.label'), toggle('spellCheck', s.spellCheck), t('spell.help'))}
        ${row(t('persian.settings.normaliseLetters'), toggle('fixLetters', s.fixLetters))}
        ${row(t('persian.settings.fixZwnj'), toggle('fixZwnj', s.fixZwnj))}
        ${row(t('persian.settings.fixPunctuationSpacing'), toggle('fixPunctuationSpacing', s.fixPunctuationSpacing))}
        ${row(t('persian.settings.normalisePunctuation'), toggle('fixPunctuation', s.fixPunctuation))}
        ${row(
          t('persian.settings.digits'),
          segmented(
            'fixDigits',
            [
              { value: 'keep', label: t('persian.settings.digitsKeep') },
              { value: 'fa', label: t('persian.settings.digitsFa') },
              { value: 'en', label: t('persian.settings.digitsEn') },
            ],
            s.fixDigits,
          ),
          t('persian.settings.help'),
        )}
      </section>

      <section class="group">
        <h3 class="group__title">${t('settings.sections.content')}</h3>
        ${row(t('settings.math.label'), toggle('math', s.math), t('settings.math.help'))}
        ${row(t('settings.diagrams.label'), toggle('diagrams', s.diagrams), t('settings.diagrams.help'))}
        ${row(t('settings.frontMatter.label'), toggle('showFrontMatter', s.showFrontMatter))}
        ${row(t('settings.restoreSession.label'), toggle('restoreSession', s.restoreSession))}
        ${row(t('autosave.label'), toggle('autoSave', s.autoSave), t('autosave.help'))}
        ${row(
          t('settings.externalImages.label'),
          toggle('externalImages', s.externalImages),
          t('settings.externalImages.help'),
        )}
        ${row(t('settings.rawHtml.label'), toggle('rawHtml', s.rawHtml), t('settings.rawHtml.help'))}
        ${row(
          t('settings.confirmLinks.label'),
          toggle('confirmLinks', s.confirmLinks),
          t('settings.confirmLinks.help'),
        )}
        ${row(t('settings.liveReload.label'), toggle('liveReload', s.liveReload))}
      </section>

      <section class="group about">
        <h3 class="group__title">${t('settings.sections.about')}</h3>
        <div class="about__head">
          ${iconPlate(48)}
          <div>
            <div class="about__name">${t('app.name')}</div>
            <div class="about__version">${t('about.version', {
              version: localiseDigits(APP_VERSION),
            })}${BUILD_STAMP ? ` · ${t('about.build', { stamp: localiseDigits(BUILD_STAMP) })}` : ''}</div>
          </div>
        </div>
        <p class="about__line">${t('about.author')}</p>
        <p class="about__line about__line--muted">${t('about.free')}</p>
        <p class="about__links">
          <a href="#" data-external="${REPO_URL}">${t('about.repo')}</a>
          <span aria-hidden="true">·</span>
          <a href="#" data-external="${LICENCE_URL}">${t('about.licence')}</a>
        </p>
      </section>

    </div>

    <footer class="panel__foot">
      <button class="btn btn--ghost" id="settings-update">${t('update.check')}</button>
      <div class="panel__foot-spacer"></div>
      <button class="btn btn--ghost" id="settings-reset">${t('settings.reset')}</button>
    </footer>
  </div>`;

  bindControls();
}

function bindControls(): void {
  if (!overlay) return;

  overlay.querySelector('.panel__close')?.addEventListener('click', closeSettings);

  overlay.querySelector('#settings-update')?.addEventListener('click', () => {
    void onCheckUpdate?.();
  });

  // The About links must never navigate the webview itself — that would
  // replace the whole app with a web page and there is no back button.
  overlay.querySelector('.about__links')?.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLElement>('[data-external]');
    if (!a) return;
    e.preventDefault();
    onOpenLink?.(a.dataset.external!);
  });

  overlay.querySelector('#settings-reset')?.addEventListener('click', () => {
    if (window.confirm(t('settings.resetConfirm'))) {
      store.reset();
      renderPanel();
      onChanged?.();
    }
  });

  // Segmented controls
  for (const group of Array.from(overlay.querySelectorAll<HTMLElement>('[data-field]'))) {
    const field = group.dataset.field!;

    if (group.classList.contains('segmented') || group.classList.contains('swatches')) {
      group.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest<HTMLElement>('[data-value]');
        if (!btn) return;
        const raw = btn.dataset.value!;
        if (field === 'fontWeight') update('fontWeight', Number(raw));
        else if (field === 'language') update('language', raw as Language);
        else if (field === 'theme') update('theme', raw as Theme);
        else if (field === 'directionMode') update('directionMode', raw as DirectionMode);
        else if (field === 'accent') update('accent', raw as AccentName);
        else if (field === 'fixDigits') update('fixDigits', raw as 'fa' | 'en' | 'keep');
        else if (field === 'contentTheme') update('contentTheme', raw as never);
      });
      continue;
    }

    if (group.classList.contains('switch')) {
      group.addEventListener('click', () => {
        const key = field as keyof Settings;
        update(key, !store.current[key] as never);
      });
    }
  }

  // Sliders — live preview while dragging, one store write per input event.
  for (const input of Array.from(overlay.querySelectorAll<HTMLInputElement>('input[type=range]'))) {
    const field = input.dataset.field as keyof Settings;
    input.addEventListener('input', () => {
      store.set(field, Number(input.value) as never);
      const out = input.nextElementSibling;
      if (out) {
        const v = Number(input.value);
        out.textContent =
          field === 'contentWidth' || field === 'fontSize'
            ? `${localiseDigits(v)}px`
            : field === 'paragraphSpacing'
              ? `${localiseDigits(v.toFixed(1))}em`
              : localiseDigits(v.toFixed(2));
      }
      onChanged?.();
    });
  }

  // Selects
  for (const select of Array.from(overlay.querySelectorAll<HTMLSelectElement>('select.select'))) {
    const field = select.dataset.field as keyof Settings;
    select.addEventListener('change', () => update(field, select.value as never));
  }
}
