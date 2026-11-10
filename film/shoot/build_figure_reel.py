#!/usr/bin/env python3
"""Build the Script v5 figure proof reel (~20s).

The cloaked cashier (2.5D rig, figure_anim.py) glides in over a real
shop page — the order-8 delivery-counter page, the same plate the
mascot reel used — at his final size (300px tall in a 1080p frame,
roughly a quarter of the frame height, bottom-right corner) and
talks: the HOOK of the approved story, in the Kokoro voice. One
gesture toward the shop on the second sentence, the slow head-shake
on the theft line, then he settles into idle sway while the owner
judges the fit.

Frames are rendered with PIL into a scratch dir, then encoded with
ffmpeg. Captions are the hook's sentences, in the Day-Book style.
"""
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

from figure_anim import FigureRig  # noqa: E402

FILM = "/home/hatch/workspace/bounden/film"
PLATE = os.path.join(FILM, "shoot/out/pickup-counter.png")
HOOK_WAV = os.path.join(FILM, "assets/voice/v5/v5-hook.wav")
HOOK_SENTS = os.path.join(FILM, "assets/voice/v5/v5-hook-sentences.json")
OUT = os.path.join(FILM, "figure-proof-reel.mp4")
SCRATCH = "/home/hatch/scratch-fig/reel-frames"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"

FPS = 24
W, H = 1920, 1080
RIG_H = 600            # render the layer at 2x, paste at 0.5x
DISP_H = 300           # displayed figure height (~quarter of frame)
VOICE_START = 0.9
GREEN = (20, 104, 76)
CREAM = (250, 245, 234)

CAPTIONS = [
    ["I'm the cashier of this shop."],
    ["Yesterday, a young developer came to me."],
    ["He needed credits for his work — but the last seller",
     "he paid had run away with his money."],
]


def ease(u: float) -> float:
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def paste_rgba(bg: Image.Image, layer: Image.Image, x: int, y: int) -> None:
    """alpha_composite with clipping at the frame edges."""
    w, h = layer.size
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(bg.size[0], x + w), min(bg.size[1], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    crop = layer.crop((x0 - x, y0 - y, x1 - x, y1 - y))
    region = bg.crop((x0, y0, x1, y1))
    region.alpha_composite(crop)
    bg.paste(region, (x0, y0))


def main() -> int:
    import wave
    with wave.open(HOOK_WAV) as w:
        hook_dur = w.getnframes() / w.getframerate()
    with open(HOOK_SENTS) as f:
        sents = json.load(f)
    total = max(19.5, VOICE_START + hook_dur + 4.5)
    n_frames = int(total * FPS)
    print(f"hook {hook_dur:.2f}s; reel {total:.2f}s; {n_frames} frames")

    # sentence windows in reel time
    wins = [(VOICE_START + s["start"], VOICE_START + s["start"] + s["dur"])
            for s in sents]
    s2 = wins[1]
    s3 = wins[2]
    shake0 = s3[0] + 0.35 * (s3[1] - s3[0])
    shake1 = s3[0] + 0.88 * (s3[1] - s3[0])

    rig = FigureRig(height=RIG_H)
    disp_w = round(rig.wd * DISP_H / RIG_H)
    x_final = W - disp_w - 64
    y_final = H - DISP_H
    glide_dur = 2.8

    # soft drop shadow from the rest pose
    rest = rig.frame(0.0)
    alpha = np.asarray(rest)[..., 3].astype(np.float32) / 255.0
    sh = np.zeros((RIG_H, rig.wd, 4), dtype=np.uint8)
    sh[..., 3] = np.clip(alpha * 255 * 0.34, 0, 255).astype(np.uint8)
    shadow = Image.fromarray(sh, "RGBA").filter(ImageFilter.GaussianBlur(14))
    shadow = shadow.resize((disp_w, DISP_H), Image.LANCZOS)

    font = ImageFont.truetype(FONT, 30)
    plate = Image.open(PLATE).convert("RGBA")
    os.makedirs(SCRATCH, exist_ok=True)

    def head_angle(t: float) -> float:
        ang = 0.7 * math.sin(2 * math.pi * t / 7.3)
        if t < glide_dur:
            ang += 2.0 * ease(t / glide_dur)
        # gesture toward the shop across sentence 2
        u = (t - s2[0]) / max(s2[1] - s2[0], 0.1)
        if 0.0 <= u <= 1.0:
            ang += 5.0 * math.sin(math.pi * min(max(u, 0.0), 1.0))
        # slow head-shake on the theft line
        if shake0 <= t <= shake1:
            u = (t - shake0) / (shake1 - shake0)
            ang += 3.4 * math.sin(2 * math.pi * 2 * u) * math.sin(math.pi * u)
        return ang

    def caption_for(t: float):
        for i, (a, b) in enumerate(wins):
            if a - 0.05 <= t <= b + 0.35:
                fade = min(1.0, (t - a + 0.05) / 0.18, (b + 0.35 - t) / 0.18)
                return CAPTIONS[i], max(0.0, fade)
        return None, 0.0

    for i in range(n_frames):
        t = i / FPS
        frame = plate.copy()
        # glide + lean + bob
        gp = ease(t / glide_dur) if t < glide_dur else 1.0
        x = int(1960 + (x_final - 1960) * gp)
        bob = -5 * abs(math.sin(2 * math.pi * t / 0.62)) * (1 - gp) if t < glide_dur else 0
        lean = 1.4 * math.sin(math.pi * gp) if t < glide_dur else 0.0
        # gesture lean toward the shop (frame-left) during sentence 2
        u = (t - s2[0]) / max(s2[1] - s2[0], 0.1)
        if 0.0 <= u <= 1.0:
            lean += 2.2 * math.sin(math.pi * u)
        layer = rig.frame(t, head_angle=head_angle(t))
        if abs(lean) > 0.01:
            layer = layer.rotate(lean, resample=Image.BICUBIC,
                                 center=(rig.wd / 2, RIG_H))
        layer = layer.resize((disp_w, DISP_H), Image.LANCZOS)
        y = int(y_final + bob)
        paste_rgba(frame, shadow, x + 10, y_final + 12 + int(bob * 0.4))
        paste_rgba(frame, layer, x, y)
        # caption
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

    # audio: hook delayed to VOICE_START, loudness-normalised, padded
    audio = os.path.join(SCRATCH, "audio.m4a")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", HOOK_WAV,
         "-af", f"adelay={int(VOICE_START * 1000)}:all=1,"
                f"loudnorm=I=-16:TP=-1.5:LRA=11,"
                f"aresample=48000,"
                f"apad,atrim=0:{total:.2f},"
                f"afade=t=out:st={total - 0.5:.2f}:d=0.5",
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
