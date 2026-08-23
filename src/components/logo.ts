/**
 * B mark logo, inlined as SVG strings.
 *
 * Why inline rather than <img src="...">: the app runs under a strict CSP with
 * no remote origins, the marks must recolour with the theme, and an inline SVG
 * costs no extra request or asset-protocol permission.
 *
 * Geometry is generated from assets/branding/bmark-icon.svg — the vector
 * master traced from the supplied artwork (shape IoU 0.996, mean pixel delta
 * 1.18/255). Re-run `python scripts/generate-branding.py` after editing the
 * masters so the .ico and PNGs stay in sync with what is drawn here.
 */

/** The stroke silhouette: 86 x 301, top-right and bottom-left fully rounded. */
const BAR = 'M0 0 H43 A43 43 0 0 1 86 43 V301 H43 A43 43 0 0 1 0 258 Z';
const BAR_A = 'translate(208.31 255.8) rotate(-37.5) translate(-43 -150.5)';
const BAR_B = 'translate(355.42 255.8) rotate(-37.5) translate(-43 -150.5)';
const CARET = 'M30 322 H154 L92 384 Z';

/** Each inline copy needs unique gradient ids or they collide in one document. */
let seq = 0;
const uid = () => `bm${(seq++).toString(36)}`;

/**
 * The brand mark in full colour, transparent background —
 * `assets/branding/bmark-mark.svg` inlined.
 *
 * This is the default mark for the app: title bar, empty state, About. The
 * gradient runs white → lime, which reads on the dark theme but disappears
 * against a light background, so `brandMark` swaps the white stop for the
 * theme's foreground colour via `currentColor`. The lime half is constant —
 * that is the part people recognise.
 */
export function brandMark(size = 18): string {
  const id = uid();
  return `<svg class="brandmark" width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="#BEFB00"/>
    </linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#BEFB00"/><stop offset="1" stop-color="currentColor"/>
    </linearGradient>
  </defs>
  <path d="${BAR}" transform="${BAR_A}" fill="url(#${id}a)"/>
  <path d="${BAR}" transform="${BAR_B}" fill="url(#${id}b)"/>
  <path d="${CARET}" fill="#BEFB00" opacity=".85"/>
</svg>`;
}

/**
 * Strictly single-colour mark, for contexts where even the lime is too much:
 * a disabled control, a print header, a Windows notification.
 */
export function markMono(size = 18): string {
  return `<svg class="brandmark" width="${size}" height="${size}" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
  <path d="${BAR}" transform="${BAR_A}"/>
  <path d="${BAR}" transform="${BAR_B}"/>
  <path d="${CARET}"/>
</svg>`;
}

/**
 * Full-colour mark on the black plate — the app icon exactly as Windows shows
 * it. Used large, where the gradient reads.
 */
export function iconPlate(size = 88, radius = size * 0.203): string {
  const id = uid();
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#BEFB00"/>
    </linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#BEFB00"/><stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="${id}c" gradientUnits="userSpaceOnUse" x1="30" y1="322" x2="122" y2="384">
      <stop offset="0" stop-color="#E9F8C2"/><stop offset="1" stop-color="#C6EC52"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${((radius / size) * 512).toFixed(1)}" fill="#000000"/>
  <path d="${BAR}" transform="${BAR_A}" fill="url(#${id}a)"/>
  <path d="${BAR}" transform="${BAR_B}" fill="url(#${id}b)"/>
  <path d="${CARET}" fill="url(#${id}c)"/>
</svg>`;
}

/** Static markup for exported HTML, which has no `currentColor` to inherit. */
export function markForExport(size = 20): string {
  const id = uid();
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6f8f00"/><stop offset="1" stop-color="#BEFB00"/>
    </linearGradient>
  </defs>
  <path d="${BAR}" transform="${BAR_A}" fill="url(#${id}a)"/>
  <path d="${BAR}" transform="${BAR_B}" fill="url(#${id}a)"/>
  <path d="${CARET}" fill="#BEFB00"/>
</svg>`;
}
