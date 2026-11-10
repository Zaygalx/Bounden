#!/usr/bin/env python3
"""Render the Script v5 caption track for the pass-2 film.

Two layers, both in the Day-Book style of the approved proof
reel (ledger-green box, cream serif text, bottom-left):

- sentence captions, verbatim, synced to the recorded Kokoro
  lines (sentence boundaries measured from the v5 wavs);
- a beat chip per Script v5 beat caption, shown for the beat's
  first five seconds, stacked above the sentence box when both
  are on screen.

Output: a 24fps transparent PNG sequence over the film's full
86.92s, composited above backdrop + character in assemble2.py.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = "/home/hatch/scratch-fig3d/captions-v5"
FPS = 24
TOTAL = 86.92
W, H = 1920, 1080
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
GREEN = (20, 104, 76)
CREAM = (250, 245, 234)

# (start, end, [lines]) — film time; verbatim spoken sentences
SENTENCES = [
    (0.90, 2.69, ["I'm the cashier of this shop."]),
    (2.91, 5.43, ["Yesterday, a young developer came to me."]),
    (5.65, 10.96, ["He needed credits for his work, but the last seller",
                   "he paid had run away with his money."]),
    (12.20, 14.63, ["So I told him: don't trust my smile."]),
    (15.12, 16.17, ["Read my rules."]),
    (16.70, 20.55, ["Everything here is open, and my key",
                    "can only do two things."]),
    (20.96, 21.80, ["He read them."]),
    (22.40, 23.21, ["And he stayed."]),
    (24.75, 26.12, ["He paid ten dollars."]),
    (26.66, 30.06, ["I checked the money, opened his sealed code,",
                    "and gave it to him."]),
    (30.53, 32.18, ["Only his wallet can open it."]),
    (32.63, 34.63, ["He got exactly what he came for."]),
    (38.60, 41.43, ["But he asked me: what if you turn bad one day?"]),
    (41.88, 42.85, ["So I showed him."]),
    (43.48, 47.14, ["I hid a secret order inside a payment:",
                    "send me all the money."]),
    (47.70, 49.49, ["The shop read it as just words."]),
    (49.87, 50.89, ["Nothing moved."]),
    (52.40, 54.99, ["I tried to refund myself from an old order."]),
    (55.58, 57.05, ["Too late, said the contract."]),
    (57.47, 58.41, ["Refused."]),
    (61.50, 64.34, ["I tried my own key on the shop's money directly."]),
    (64.95, 66.33, ["It won't even start."]),
    (70.40, 73.26, ["That is why he could buy from me",
                    "without knowing me."]),
    (73.76, 75.19, ["I can't steal from this shop."]),
    (75.74, 77.52, ["Not won't. Can't."]),
    (77.94, 80.18, ["Here is everything I am able to do."]),
]

# (start, end, text) — Script v5's beat captions, first 5s of a beat
CHIPS = [
    (0.55, 5.55, "Yesterday, a customer came to the shop"),
    (12.15, 17.15, "He didn't have to trust — he could check"),
    (24.70, 29.70, "He paid $10 — and got exactly what he came for"),
    (38.55, 43.55, "Attack 1: a hidden order — treated as just words"),
    (52.35, 57.35, "Attack 2: an unfair refund — refused"),
    (61.45, 66.45, "Attack 3: his own key on the money — it won't start"),
    (70.05, 75.05, "Why a stranger could buy safely"),
]


def fade(t, a, b, edge):
    if t < a or t > b:
        return 0.0
    return max(0.0, min(1.0, (t - a) / edge, (b - t) / edge))


def box(d, lines, font, bx, by, alpha):
    widths = [d.textlength(s, font=font) for s in lines]
    bw = int(max(widths)) + 40
    bh = 34 * len(lines) + 26
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=10,
                        fill=GREEN + (int(235 * alpha),))
    for j, s in enumerate(lines):
        d.text((bx + 20, by + 14 + 34 * j), s, font=font,
               fill=CREAM + (int(255 * alpha),))
    return by  # top of the box drawn


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    font = ImageFont.truetype(FONT, 30)
    chip_font = ImageFont.truetype(FONT, 26)
    n = int(TOTAL * FPS) + 1
    for i in range(n):
        t = i / FPS
        frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        cap_top = None
        for a, b, lines in SENTENCES:
            f = fade(t, a - 0.05, b + 0.30, 0.18)
            if f > 0:
                bh = 34 * len(lines) + 26
                cap_top = box(d, lines, font, 44, H - 44 - bh, f)
                break
        for a, b, text in CHIPS:
            f = fade(t, a, b, 0.25)
            if f > 0:
                bh = 34 + 24
                by = (cap_top - 14 - bh) if cap_top else (H - 44 - bh)
                box(d, [text], chip_font, 44, by, f)
                break
        frame.save(os.path.join(OUT, f"f{i:04d}.png"))
        if i % 400 == 0:
            print(f"caption frame {i}/{n}")
    print("captions done:", n, "frames ->", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
