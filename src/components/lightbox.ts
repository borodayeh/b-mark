/**
 * Image lightbox.
 *
 * A diagram or screenshot capped at the content width is often unreadable.
 * Clicking opens it full-size, with the wheel zooming and a drag panning.
 *
 * Deliberately no library: the whole behaviour is a hundred lines, and pulling
 * in a lightbox package would add more than the feature is worth to a project
 * that declined Mermaid on size grounds for a while.
 */

import { icon, ICONS } from './icons';
import { t } from '../i18n';

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;

let overlay: HTMLElement | null = null;

export function isLightboxOpen(): boolean {
  return overlay !== null;
}

export function closeLightbox(): void {
  overlay?.remove();
  overlay = null;
  document.body.classList.remove('lightbox-open');
}

function open(src: string, alt: string): void {
  closeLightbox();

  overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alt || t('image.viewer'));
  overlay.innerHTML = `
    <div class="lightbox__bar">
      <span class="lightbox__caption" dir="auto">${escapeHtml(alt)}</span>
      <span class="lightbox__zoom" id="lb-zoom">100%</span>
      <button class="btn lightbox__btn" id="lb-reset" title="${t('image.reset')}">1:1</button>
      <button class="btn lightbox__btn" id="lb-close" title="${t('find.close')}">${icon(ICONS.close, 15)}</button>
    </div>
    <div class="lightbox__stage" id="lb-stage">
      <img class="lightbox__img" id="lb-img" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" draggable="false">
    </div>`;

  document.body.appendChild(overlay);
  document.body.classList.add('lightbox-open');

  const img = overlay.querySelector<HTMLImageElement>('#lb-img')!;
  const stage = overlay.querySelector<HTMLElement>('#lb-stage')!;
  const readout = overlay.querySelector<HTMLElement>('#lb-zoom')!;

  let scale = 1;
  let x = 0;
  let y = 0;

  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    readout.textContent = `${Math.round(scale * 100)}%`;
  };

  const reset = () => {
    scale = 1;
    x = 0;
    y = 0;
    apply();
  };

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Zoom toward the pointer rather than the centre, which is what makes
      // wheel-zoom feel right instead of disorienting.
      const rect = img.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      const ratio = next / scale;

      x -= px * (ratio - 1);
      y -= py * (ratio - 1);
      scale = next;
      apply();
    },
    { passive: false },
  );

  let dragging = false;
  let originX = 0;
  let originY = 0;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    originX = e.clientX - x;
    originY = e.clientY - y;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('lightbox__stage--dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    x = e.clientX - originX;
    y = e.clientY - originY;
    apply();
  });
  const endDrag = () => {
    dragging = false;
    stage.classList.remove('lightbox__stage--dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Double-click toggles between fit and 2x, the convention everywhere.
  img.addEventListener('dblclick', () => {
    if (scale === 1) {
      scale = 2;
      apply();
    } else reset();
  });

  overlay.querySelector('#lb-reset')?.addEventListener('click', reset);
  overlay.querySelector('#lb-close')?.addEventListener('click', closeLightbox);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay || e.target === stage) closeLightbox();
  });

  apply();
  overlay.querySelector<HTMLElement>('#lb-close')?.focus();
}

/** Make every rendered image clickable. */
export function attachImageZoom(content: HTMLElement): void {
  for (const img of Array.from(content.querySelectorAll<HTMLImageElement>('img'))) {
    if (img.dataset.zoomable === '1') continue;
    // A blocked remote image has nothing to enlarge.
    if (!img.getAttribute('src')) continue;

    img.dataset.zoomable = '1';
    img.classList.add('zoomable');
    img.addEventListener('click', () => open(img.src, img.alt));
  }

  // Diagrams are worth enlarging too, and they are SVG rather than <img>.
  for (const figure of Array.from(content.querySelectorAll<HTMLElement>('.diagram'))) {
    if (figure.dataset.zoomable === '1') continue;
    figure.dataset.zoomable = '1';
    const svg = figure.querySelector('svg');
    if (!svg) continue;
    svg.classList.add('zoomable');
    svg.addEventListener('click', () => {
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      open(url, 'diagram');
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
