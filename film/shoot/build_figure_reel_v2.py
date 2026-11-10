#!/usr/bin/env python3
"""Build the Script v5 figure proof reel v2 (~25s).

Pass 1c: the presenter is a rigged 3D character (Blender,
figure3d_build.py) — he WALKS in with a real gait and a moving
cloak, raises and swings his hand in greeting, points at the shop
on "Read my rules", gives the slow head-shake on the theft line,
and settles into a breathing idle. The retired 2.5D warp rig is
not used anywhere in this reel.

The Blender layer (transparent PNG sequence, rendered at ~1.8x)
is graded warm, given a contact shadow from its own silhouette,
and composited over the real order-8 delivery-counter page at
his final size (300px tall in the 1080p frame, bottom-right).
Audio is the already-recorded Kokoro narration: HOOK + CHOICE,
story captions in the Day-Book style.
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FILM = "/home/hatch/workspace/bounden/film"
PLATE = os.path.join(FILM, "shoot/out/pickup-counter.png")
SEQ = "/home/hatch/scratch-fig3d/seq"
HOOK_WAV = os.path.join(FILM, "assets/voice/v5/v5-hook.wav")
CHOICE_WAV = os.path.join(FILM, "assets/voice/v5/v5-choice.wav")
OUT = os.path.join(FILM, "figure-proof-reel-v2.mp4")
SCRATCH = "/home/hatch/scratch-fig3d/reel2-frames"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"

FPS = 24
TOTAL = 24.6
W, H = 1920, 1080
SCALE = 0.55                      # 1200x982 layer -> 660x540
OX, OY = W - 660, H - 540         # layer origin in the frame
VOICE_HOOK = 0.9
VOICE_CHOICE = 11.36
GREEN = (20, 104, 76)
CREAM = (250, 245, 234)

# (start, end, [lines]) — reel time, verbatim spoken sentences
CAPTIONS = [
    (0.90, 2.69, ["I'm the cashier of this shop."]),
    (2.91, 5.43, ["Yesterday, a young developer came to me."]),
    (5.65, 10.96, ["He needed credits for his work — but the last seller",
                   "he paid had run away with his money."]),
    (11.36, 13.79, ["So I told him: don't trust my smile."]),
    (14.28, 15.33, ["Read my rules."]),
    (15.86, 19.71, ["Everything here is open, and my key",
                    "can only do two things."]),
    (20.12, 22.67, ["He read them. And he stayed."]),
]


def grade(layer: Image.Image) -> Image.Image:
    """A whisper of warm cinema on the character layer only."""
    a = np.asarray(layer).astype(np.float32)
    rgb = a[..., :3]
    rgb[..., 0] = np.clip(rgb[..., 0] * 1.05 + 4, 0, 255)
    rgb[..., 1] = np.clip(rgb[..., 1] * 1.00 + 1, 0, 255)
    rgb[..., 2] = np.clip(rgb[..., 2] * 0.93, 0, 255)
    # gentle S-curve for modeling
    x = rgb / 255.0
    rgb = 255.0 * np.clip(x * x * (3 - 2 * x) * 0.18 + x * 0.82, 0, 1)
    a[..., :3] = rgb
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def contact_shadow(layer_small: Image.Image) -> Image.Image:
    """Soft ground shadow pooled at the hem, from his own alpha —
    it walks when he walks."""
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


def caption_for(t):
    for a, b, lines in CAPTIONS:
        if a - 0.05 <= t <= b + 0.30:
            fade = min(1.0, (t - a + 0.05) / 0.18, (b + 0.30 - t) / 0.18)
            return lines, max(0.0, fade)
    return None, 0.0


def main() -> int:
    n_frames = int(TOTAL * FPS) + 1
    plate = Image.open(PLATE).convert("RGBA")
    font = ImageFont.truetype(FONT, 30)
    os.makedirs(SCRATCH, exist_ok=True)

    for i in range(n_frames):
        t = i / FPS
        src = Image.open(os.path.join(SEQ, f"f_{i + 1:04d}.png"))
        layer = grade(src).resize((660, 540), Image.LANCZOS)
        frame = plate.copy()
        frame.alpha_composite(contact_shadow(layer), (OX + 4, OY + 4))
        frame.alpha_composite(layer, (OX, OY))
        lines, fade = caption_for(t)
        if lines and fade > 0:
            cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(cap)
            widths = [d.textlength(s, font=font) for s in lines]
            bw = int(max(widths)) + 40
            bh = 34 * len(lines) + 26
            bx, by = 44, H - 44 - bh
            d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=10,
                                fill=GREEN + (int(235 * fade),))
            for j, s in enumerate(lines):
                d.text((bx + 20, by + 14 + 34 * j), s, font=font,
                       fill=CREAM + (int(255 * fade),))
            frame.alpha_composite(cap)
        frame.convert("RGB").save(os.path.join(SCRATCH, f"f{i:04d}.png"))
        if i % 96 == 0:
            print(f"frame {i}/{n_frames}")

    audio = os.path.join(SCRATCH, "audio.m4a")
    fc = (f"[0:a]adelay={int(VOICE_HOOK * 1000)}:all=1[h];"
          f"[1:a]adelay={int(VOICE_CHOICE * 1000)}:all=1[c];"
          f"[h][c]amix=inputs=2:duration=longest:normalize=0[m];"
          f"[m]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,"
          f"apad,atrim=0:{TOTAL},afade=t=out:st={TOTAL - 0.5}:d=0.5[a]")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", HOOK_WAV, "-i", CHOICE_WAV,
         "-filter_complex", fc, "-map", "[a]",
         "-c:a", "aac", "-b:a", "128k", audio], check=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-framerate", str(FPS),
         "-i", os.path.join(SCRATCH, "f%04d.png"), "-i", audio,
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", OUT], check=True)
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
