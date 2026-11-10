#!/usr/bin/env python3
"""Bake the film's character layer (pass 2).

Takes the Blender PNG sequence (scratch-fig3d/seq-film, 1200x982),
applies the proof reel's warm grade, scales it so the figure
stands 500px tall in the 1080p frame (owner's amendment: bigger —
the proof stood him at ~300px and read as straining on a phone),
pools his contact shadow at the hem, and writes the composited
layer sequence the assembler overlays at x=946, y=136 (hem flush
with the frame's bottom edge, rest-pose figure screen box
x 1594-1890, y 580-1080).

Grade and shadow functions are build_figure_reel_v2.py's,
unchanged — the look the owner approved, at the new size.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SRC = "/home/hatch/scratch-fig3d/seq-film"
OUT = "/home/hatch/scratch-fig3d/seq-film-layer"
LAYER_W, LAYER_H = 1154, 944          # figure height 520 * 944/982 = 500


def grade(layer: Image.Image) -> Image.Image:
    a = np.asarray(layer).astype(np.float32)
    rgb = a[..., :3]
    rgb[..., 0] = np.clip(rgb[..., 0] * 1.05 + 4, 0, 255)
    rgb[..., 1] = np.clip(rgb[..., 1] * 1.00 + 1, 0, 255)
    rgb[..., 2] = np.clip(rgb[..., 2] * 0.93, 0, 255)
    x = rgb / 255.0
    rgb = 255.0 * np.clip(x * x * (3 - 2 * x) * 0.18 + x * 0.82, 0, 1)
    a[..., :3] = rgb
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def contact_shadow(layer_small: Image.Image) -> Image.Image:
    alpha = np.asarray(layer_small)[..., 3].astype(np.float32) / 255.0
    h, w = alpha.shape
    band = alpha[int(h * 0.72):, :]
    pool = np.maximum(band.max(axis=0), band.mean(axis=0) * 1.6)
    sh = np.zeros((h, w, 4), dtype=np.uint8)
    strip = np.tile(pool, (26, 1))
    strip = strip * np.linspace(0.0, 1.0, 26)[:, None] ** 1.5
    sh[h - 26:, :, 3] = np.clip(strip * 255 * 0.38, 0, 255).astype(np.uint8)
    img = Image.fromarray(sh, "RGBA")
    return img.filter(ImageFilter.GaussianBlur(7))


def main() -> int:
    files = sorted(glob.glob(os.path.join(SRC, "f_*.png")))
    assert files, "no source frames"
    os.makedirs(OUT, exist_ok=True)
    for i, path in enumerate(files):
        src = Image.open(path).convert("RGBA")
        layer = grade(src).resize((LAYER_W, LAYER_H), Image.LANCZOS)
        canvas = Image.new("RGBA", (LAYER_W, LAYER_H), (0, 0, 0, 0))
        canvas.alpha_composite(contact_shadow(layer), (4, 4))
        canvas.alpha_composite(layer, (0, 0))
        canvas.save(os.path.join(OUT, f"f{i + 1:04d}.png"))
        if i % 200 == 0:
            print(f"baked {i}/{len(files)}")
    print("baked", len(files), "frames ->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
