# Branding source

`BMark-original.png` is the artwork as supplied, 512×512 PNG.

The vectors beside it in `assets/branding/` were traced from this file, not
redrawn by eye. The geometry was recovered by analysing the raster:

| Parameter | Recovered value |
|---|---|
| Stroke | rounded rectangle, 86 × 301 |
| Rounded corners | top-right and bottom-left only, r = 43 (half the width) |
| Rotation | −37.5° |
| Stroke centres | (208.31, 255.8) and (355.42, 255.8) |
| Caret | (30, 322) → (154, 322) → (92, 384) |
| Left stroke gradient | #FFFFFF → #BEFB00 |
| Right stroke gradient | #BEFB00 → #FFFFFF (mirrored) |

Accuracy of the trace against the original: **shape IoU 0.9956**, mean absolute
pixel difference **1.18 / 255**.

Regenerate every raster from the vectors with:

```bash
python scripts/generate-branding.py
```
