/**
 * Icon set.
 *
 * All 16×16 on a shared grid, stroke-based, inheriting `currentColor` so they
 * recolour with the theme. Kept in one file so the visual weight stays
 * consistent — icons drawn ad hoc in the component that needs them always end
 * up mismatched.
 */

export function icon(path: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const ICONS = {
  open: '<path d="M1.75 12.75V3.75a1 1 0 0 1 1-1h3.1l1.5 2h6.9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1Z"/>',

  refresh: '<path d="M13.75 8a5.75 5.75 0 1 1-1.7-4.08"/><path d="M13.9 2.4v3.2h-3.2"/>',

  zoomIn:
    '<circle cx="7.1" cy="7.1" r="4.6"/><path d="M10.6 10.6 14 14"/><path d="M7.1 5.2v3.8M5.2 7.1h3.8"/>',

  zoomOut: '<circle cx="7.1" cy="7.1" r="4.6"/><path d="M10.6 10.6 14 14"/><path d="M5.2 7.1h3.8"/>',

  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.2v1.7M8 13.1v1.7M14.8 8h-1.7M2.9 8H1.2M12.8 3.2l-1.2 1.2M4.4 11.6l-1.2 1.2M12.8 12.8l-1.2-1.2M4.4 4.4 3.2 3.2"/>',

  moon: '<path d="M13.6 9.7A5.9 5.9 0 0 1 6.3 2.4 5.95 5.95 0 1 0 13.6 9.7Z"/>',

  auto: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none"/>',

  /**
   * Settings — a proper cog.
   *
   * The previous icon was a circle with eight radial ticks, which reads as a
   * sun or a loading spinner, not as settings. This is the conventional
   * toothed gear: an outer ring of six teeth around a hub.
   */
  settings:
    '<circle cx="8" cy="8" r="2.15"/>' +
    '<path d="M12.9 9.85a1.1 1.1 0 0 0 .22 1.22l.04.04a1.34 1.34 0 1 1-1.9 1.9l-.04-.04a1.1 1.1 0 0 0-1.22-.22 1.1 1.1 0 0 0-.67 1.01v.11a1.34 1.34 0 1 1-2.68 0v-.06a1.1 1.1 0 0 0-.72-1.01 1.1 1.1 0 0 0-1.22.22l-.04.04a1.34 1.34 0 1 1-1.9-1.9l.04-.04a1.1 1.1 0 0 0 .22-1.22 1.1 1.1 0 0 0-1.01-.67h-.11a1.34 1.34 0 1 1 0-2.68h.06a1.1 1.1 0 0 0 1.01-.72 1.1 1.1 0 0 0-.22-1.22l-.04-.04a1.34 1.34 0 1 1 1.9-1.9l.04.04a1.1 1.1 0 0 0 1.22.22h.05a1.1 1.1 0 0 0 .67-1.01v-.11a1.34 1.34 0 0 1 2.68 0v.06a1.1 1.1 0 0 0 .67 1.01 1.1 1.1 0 0 0 1.22-.22l.04-.04a1.34 1.34 0 1 1 1.9 1.9l-.04.04a1.1 1.1 0 0 0-.22 1.22v.05a1.1 1.1 0 0 0 1.01.67h.11a1.34 1.34 0 0 1 0 2.68h-.06a1.1 1.1 0 0 0-1.01.67Z"/>',

  edit: '<path d="M11.4 2.35a1.63 1.63 0 0 1 2.3 2.3L5.4 12.95l-3.05.75.75-3.05Z"/><path d="m10.2 3.55 2.3 2.3"/>',

  save: '<path d="M2.6 3.6a1 1 0 0 1 1-1h7.2l2.6 2.6v7.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1Z"/><path d="M5.1 2.6v3.5h5.3V2.6M5.1 13.4V9.6h5.8v3.8"/>',

  outline: '<path d="M2.4 4h2M2.4 8h2M2.4 12h2"/><path d="M6.8 4h6.8M6.8 8h6.8M6.8 12h4.4"/>',

  search: '<circle cx="7" cy="7" r="4.6"/><path d="m10.5 10.5 3.4 3.4"/>',

  print:
    '<path d="M4.4 6.2V2.6h7.2v3.6"/><path d="M4.4 12h-1.3a1 1 0 0 1-1-1V7.2a1 1 0 0 1 1-1h9.8a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-1.3"/><path d="M4.4 9.8h7.2v3.6H4.4Z"/>',

  export:
    '<path d="M13.5 10v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-3"/><path d="M5 6.2 8 3.2l3 3"/><path d="M8 3.2v7.3"/>',

  copy: '<rect x="5.6" y="5.6" width="8" height="8" rx="1.2"/><path d="M11 3.4a1.2 1.2 0 0 0-1.2-1.2H3.6a1.2 1.2 0 0 0-1.2 1.2v6.2a1.2 1.2 0 0 0 1.2 1.2"/>',

  close: '<path d="M4 4 12 12M12 4 4 12"/>',

  /** Word export — a document with the W of the format, not a Microsoft mark. */
  word:
    '<path d="M3.2 1.9h6.1l3.5 3.5v8.7a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1V2.9a1 1 0 0 1 1-1Z"/>' +
    '<path d="M9.3 1.9v3.5h3.5"/>' +
    '<path d="m4.9 8.1.9 3.3.9-2.4.9 2.4.9-3.3" stroke-width="1.2"/>',

  /** A folder tree, distinct from the plain open-file folder. */
  folder:
    '<path d="M1.9 12.8V4a1 1 0 0 1 1-1h3l1.4 1.9h6.8a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1Z"/>' +
    '<path d="M5.4 7.6h5.2M5.4 10.1h3.4" stroke-width="1.1"/>',

  chevronDown: '<path d="m4 6 4 4 4-4"/>',

  /**
   * Persian text tools. A stylised ZWNJ: two glyph strokes with the
   * zero-width joiner mark between them, which is literally what the feature
   * inserts. A generic "wand" would say nothing about what it does.
   */
  persian:
    '<path d="M2.6 12.4V6.2a2.1 2.1 0 0 1 2.1-2.1h.5"/>' +
    '<path d="M13.4 12.4V6.2a2.1 2.1 0 0 0-2.1-2.1h-.5"/>' +
    '<path d="M8 6v4.6"/><path d="M6.6 12.4h2.8"/>',

  // --- window controls, drawn to Microsoft's Segoe Fluent metrics ----------
  winMinimize: '<path d="M2.5 8h11" stroke-width="1"/>',
  winMaximize: '<rect x="2.9" y="2.9" width="10.2" height="10.2" rx="0.6" stroke-width="1"/>',
  winRestore:
    '<rect x="2.6" y="4.9" width="8.5" height="8.5" rx="0.6" stroke-width="1"/>' +
    '<path d="M4.9 4.9V3.2a.6.6 0 0 1 .6-.6h7.3a.6.6 0 0 1 .6.6v7.3a.6.6 0 0 1-.6.6h-1.7" stroke-width="1"/>',
  winClose: '<path d="M3.4 3.4 12.6 12.6M12.6 3.4 3.4 12.6" stroke-width="1"/>',
} as const;
