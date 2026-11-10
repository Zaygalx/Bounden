#!/usr/bin/env python3
"""2.5D animation rig for the Bounden cashier figure.

The figure is a cinematic still (the owner's supplied image, extracted
with rembg into film/assets/figure/figure-master.png). Kaggle's GPU
belongs to THE SAME WAY production this week, so the figure is brought
to life with a 2.5D warp rig instead of image-to-video:

  - cloak sway: a horizontal displacement field that grows toward the
    hem, phase-wobbled so it never loops mechanically;
  - breathing: a slow, subtle vertical swell anchored at the hem;
  - a head layer: the hood/head region is rotated around a neck pivot
    and blended back through a feathered oval mask, which gives head
    turns, tilts, nods and the slow refusal head-shake;
  - leans and glides are applied by the compositor (position/rotation
    of the whole layer), not here.

Everything is deterministic: a frame is a pure function of t and the
cue values, so pass 2 can re-render any moment exactly.

Usage as a library:  from figure_anim import FigureRig
CLI: figure_anim.py --t 1.25 --head-angle -2.0 --out frame.png
"""
import argparse
import math

import numpy as np
from PIL import Image

MASTER = "/home/hatch/workspace/bounden/film/assets/figure/figure-master.png"


def _bilinear(img: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> np.ndarray:
    """Sample img (H,W,C) at float coords (sx, sy); outside = transparent."""
    h, w, _ = img.shape
    x0 = np.floor(sx).astype(np.int64)
    y0 = np.floor(sy).astype(np.int64)
    x1 = x0 + 1
    y1 = y0 + 1
    fx = (sx - x0)[..., None]
    fy = (sy - y0)[..., None]
    x0c = np.clip(x0, 0, w - 1)
    x1c = np.clip(x1, 0, w - 1)
    y0c = np.clip(y0, 0, h - 1)
    y1c = np.clip(y1, 0, h - 1)
    valid = ((sx >= 0) & (sx <= w - 1) & (sy >= 0) & (sy <= h - 1)).astype(np.float32)[..., None]
    ia = img[y0c, x0c] * (1 - fx) * (1 - fy)
    ib = img[y0c, x1c] * fx * (1 - fy)
    ic = img[y1c, x0c] * (1 - fx) * fy
    id_ = img[y1c, x1c] * fx * fy
    return (ia + ib + ic + id_) * valid


def _smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class FigureRig:
    def __init__(self, master_path: str = MASTER, height: int = 640):
        img = Image.open(master_path)
        w = round(img.size[0] * height / img.size[1])
        img = img.resize((w, height), Image.LANCZOS)
        self.img = np.asarray(img).astype(np.float32)
        self.h, self.wd = height, w
        # neck pivot + head mask geometry (fractions of the figure box,
        # read off the extracted still: hood spans the top ~40%).
        self.pivot = (0.55 * self.wd, 0.345 * self.h)
        yy, xx = np.mgrid[0:self.h, 0:self.wd].astype(np.float32)
        self.xx, self.yy = xx, yy
        cx, cy = 0.55 * self.wd, 0.185 * self.h
        rx, ry = 0.225 * self.wd, 0.205 * self.h
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        feather = _smoothstep(1.12, 0.82, d)  # 1 inside the hood oval
        # never let the head layer reach below the shoulders
        feather *= _smoothstep(0.46 * self.h, 0.38 * self.h, yy)
        self.head_mask = feather[..., None]
        # sway shape: zero above the waist, growing to the hem
        shape = _smoothstep(0.34 * self.h, 1.0 * self.h, yy) ** 1.4
        self.sway_shape = shape

    def frame(self, t: float, head_angle: float = 0.0, sway_amp: float = 7.0,
              breath: float = 1.0) -> Image.Image:
        """Render the figure layer at time t.

        head_angle: degrees, + = turn toward frame-left (his audience
        side when he stands at bottom-right). sway/breath are gains.
        """
        phase = 2 * math.pi * t / 4.2 + 0.8 * math.sin(2 * math.pi * t / 6.7)
        dx = sway_amp * self.sway_shape * math.sin(phase)
        dy = breath * 2.2 * (self.yy / self.h) * math.sin(2 * math.pi * t / 3.8)
        body = _bilinear(self.img, self.xx - dx, self.yy - dy)
        if abs(head_angle) > 0.01:
            layer = Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), "RGBA")
            rot = layer.rotate(head_angle, resample=Image.BICUBIC,
                               center=self.pivot)
            rot_np = np.asarray(rot).astype(np.float32)
            out = body * (1 - self.head_mask) + rot_np * self.head_mask
        else:
            out = body
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--t", type=float, default=0.0)
    ap.add_argument("--head-angle", type=float, default=0.0)
    ap.add_argument("--height", type=int, default=640)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rig = FigureRig(height=a.height)
    rig.frame(a.t, head_angle=a.head_angle).save(a.out)
    print("wrote", a.out)
