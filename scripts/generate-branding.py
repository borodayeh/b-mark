#!/usr/bin/env python3
"""
Generate every branding raster from the vector masters.

    python scripts/generate-branding.py

Inputs   assets/branding/bmark-icon.svg   (black plate, for app icons)
         assets/branding/bmark-mark.svg   (transparent, for docs / README)
Outputs  assets/branding/png/*.png
         src-tauri/icons/*                (what tauri.conf.json points at)

Re-run this after any change to the SVG masters. Deliberately dependency-light:
cairosvg + Pillow, both pure-Python wheels.
"""

from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRANDING = ROOT / "assets" / "branding"
PNG_OUT = BRANDING / "png"
TAURI_ICONS = ROOT / "src-tauri" / "icons"

ICON_SVG = BRANDING / "bmark-icon.svg"
MARK_SVG = BRANDING / "bmark-mark.svg"

# Sizes Windows actually asks for, plus the ones Tauri's config names.
PLATE_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
MARK_SIZES = [32, 64, 128, 256, 512]

# Windows shows 16 and 32 px icons constantly (taskbar, title bar, Explorer
# list view). Anything below 32 must be rendered at that size, never
# downscaled from 512, or the strokes turn to mush.
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def render(svg: Path, size: int) -> Image.Image:
    data = cairosvg.svg2png(url=str(svg), output_width=size, output_height=size)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def render_plate(size: int) -> Image.Image:
    """App-icon plate.

    One master at every size. An earlier build used a simplified variant below
    32 px — caret removed, strokes scaled up — which bought a little legibility
    at 16 px and cost brand consistency: the taskbar icon was visibly a
    different logo from the one in the About box. Recognisability at a glance
    matters more than crispness of a detail nobody reads at that size.
    """
    return render(ICON_SVG, size)


def main() -> None:
    PNG_OUT.mkdir(parents=True, exist_ok=True)
    TAURI_ICONS.mkdir(parents=True, exist_ok=True)

    for size in PLATE_SIZES:
        render_plate(size).save(PNG_OUT / f"bmark-icon-{size}.png")
    for size in MARK_SIZES:
        render(MARK_SVG, size).save(PNG_OUT / f"bmark-mark-{size}.png")

    # ---- Tauri bundle icons -------------------------------------------------
    render_plate(32).save(TAURI_ICONS / "32x32.png")
    render_plate(128).save(TAURI_ICONS / "128x128.png")
    render_plate(256).save(TAURI_ICONS / "128x128@2x.png")
    render_plate(512).save(TAURI_ICONS / "icon.png")

    # ---- Multi-resolution .ico for the executable ---------------------------
    #
    # Each frame is rendered from vector at its final size.
    #
    # `bitmap_format="bmp"` is not cosmetic. Pillow defaults to writing every
    # frame as an embedded PNG, and the resource compiler used for the
    # cross-build (llvm-rc) does not carry the alpha channel of a PNG-in-ICO
    # frame through into the binary: the executable ended up with fully opaque
    # corners, so the rounded plate showed in Explorer as a hard black square
    # while the installer — which embeds the same .ico directly — was rounded.
    # Classic 32-bit DIB frames are what every icon editor emits and what every
    # resource compiler handles correctly.
    frames = [render_plate(s) for s in ICO_SIZES]
    frames[-1].save(
        TAURI_ICONS / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[:-1],
        bitmap_format="bmp",
    )

    print("branding written:")
    for p in sorted(PNG_OUT.glob("*.png")) + sorted(TAURI_ICONS.iterdir()):
        print(f"  {p.relative_to(ROOT)}  ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
