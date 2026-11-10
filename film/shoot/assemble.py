#!/usr/bin/env python3
"""Bounden demo film — assembly to the Script v3 timing map (59.0s).
hook 4.0 | act1 17.0 | wall1 10.5 | wall2 9.0 | wall3 10.0 | climax 6.5 | card 2.0
All trims are dead-time trims or parallel coverage of waits; no outcome
is altered. Voice timings honour the three 1-second silences."""
import glob
import subprocess
import sys

F = "/home/hatch/workspace/bounden/film"
R = f"{F}/render"
S = f"{F}/shoot"
V = f"{F}/assets/voice"
W = f"{F}/build"
FF = ["ffmpeg", "-y", "-v", "error"]
import os
os.makedirs(W, exist_ok=True)

def one(pattern):
    hits = sorted(glob.glob(pattern))
    assert hits, pattern
    return hits[0]

T2 = one(f"{R}/act1-take2/page@d488*.webm")
HOOK = one(f"{R}/hook/*.webm")
PICK = one(f"{R}/act1-pickup/*.webm")
PTERM = one(f"{R}/pickup-term/*.webm")
A1T = one(f"{R}/act1-term/*.webm")
W1T = one(f"{R}/wall1-term/*.webm")
W2T = one(f"{R}/wall2-term/*.webm")
W3T = one(f"{R}/wall3-term/*.webm")
EXP = one(f"{R}/explorer/*.webm")
CON = one(f"{R}/constitution/*.webm")
CARD = one(f"{R}/endcard/*.webm")
HOME = f"{F}/assets/home-live.png"

def run(cmd):
    print("+", " ".join(cmd[:6]), "…")
    subprocess.run(cmd, check=True)

def cut(src, start, dur, out, extra=None):
    cmd = FF + ["-ss", str(start), "-i", src, "-t", str(dur),
                "-vf", "fps=24,scale=1920:1080,format=yuv420p"]
    if extra:
        cmd += extra
    cmd += ["-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-an", out]
    run(cmd)

def still(img, dur, out, vf=""):
    filt = "fps=24,scale=1920:1080,format=yuv420p"
    if vf:
        filt = vf + "," + filt
    run(FF + ["-loop", "1", "-framerate", "24", "-i", img, "-t", str(dur),
              "-vf", filt, "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-an", out])

def concat(parts, out):
    lst = f"{W}/concat.txt"
    with open(lst, "w") as fh:
        for p in parts:
            fh.write(f"file '{p}'\n")
    run(FF + ["-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=24,format=yuv420p",
              "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-an", out])

def cashier_mov(seqdir, out):
    run(FF + ["-framerate", "12", "-i", f"{seqdir}/f%04d.png",
              "-c:v", "png", "-pix_fmt", "rgba", out])

def overlay(base, mov, out, enable=None, offset=0.0):
    fc = []
    if offset:
        fc.append(f"[1:v]setpts=PTS+{offset}/TB,scale=430:-1[c]")
    else:
        fc.append("[1:v]scale=430:-1[c]")
    en = f":enable='{enable}'" if enable else ""
    fc.append(f"[0:v][c]overlay=x=W-w-36:y=H-h-28{en}[v]")
    run(FF + ["-i", base, "-i", mov, "-filter_complex", ";".join(fc),
              "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", out])

# ---- cashier overlay movies -------------------------------------------------
for name in ["act1", "wall1", "wall2", "wall3a", "wall3b", "climax"]:
    cashier_mov(f"{R}/cashier-{name}", f"{W}/cashier-{name}.mov")

# ---- S0 hook (4.0) ----------------------------------------------------------
cut(HOOK, 0, 4.0, f"{W}/s0.mp4")

# ---- S1 act 1 (17.0) ---------------------------------------------------------
cut(T2, 25.3, 3.4, f"{W}/a1.mp4")
cut(T2, 37.6, 4.8, f"{W}/a2.mp4")
cut(A1T, 0.6, 2.2, f"{W}/a3.mp4")
cut(T2, 135.6, 1.5, f"{W}/a4.mp4")
cut(PICK, 7.9, 1.6, f"{W}/a5.mp4")
cut(PTERM, 7.4, 2.4, f"{W}/a6.mp4")
cut(PICK, 16.6, 1.1, f"{W}/a7.mp4")
concat([f"{W}/a{i}.mp4" for i in range(1, 8)], f"{W}/s1-raw.mp4")
overlay(f"{W}/s1-raw.mp4", f"{W}/cashier-act1.mov", f"{W}/s1.mp4", enable="lt(t,11.85)")

# ---- S2 wall 1 (10.5) --------------------------------------------------------
cut(EXP, 6.5, 3.6, f"{W}/w1a.mp4")
cut(W1T, 1.2, 3.2, f"{W}/w1b.mp4")
cut(EXP, 30.2, 3.7, f"{W}/w1c.mp4")
concat([f"{W}/w1a.mp4", f"{W}/w1b.mp4", f"{W}/w1c.mp4"], f"{W}/s2-raw.mp4")
overlay(f"{W}/s2-raw.mp4", f"{W}/cashier-wall1.mov", f"{W}/s2.mp4", enable="gte(t,3.55)")

# ---- S3 wall 2 (9.0) ---------------------------------------------------------
cut(W2T, 0.4, 5.0, f"{W}/w2a.mp4")
cut(EXP, 16.5, 1.6, f"{W}/w2b.mp4")
cut(EXP, 41.5, 2.4, f"{W}/w2c.mp4")
concat([f"{W}/w2a.mp4", f"{W}/w2b.mp4", f"{W}/w2c.mp4"], f"{W}/s3-raw.mp4")
overlay(f"{W}/s3-raw.mp4", f"{W}/cashier-wall2.mov", f"{W}/s3.mp4", enable="if(between(t,4.95,6.65),0,1)")

# ---- S4 wall 3 (10.0) --------------------------------------------------------
cut(W3T, 0.2, 4.4, f"{W}/w3a.mp4")
cut(CON, 11.0, 2.9, f"{W}/w3b.mp4")
still(HOME, 2.7, f"{W}/w3c.mp4")
concat([f"{W}/w3a.mp4", f"{W}/w3b.mp4", f"{W}/w3c.mp4"], f"{W}/s4-raw.mp4")
# flat over the terminal (first 3.2s), flat + line over the shop return (from 7.3s)
run(FF + ["-i", f"{W}/s4-raw.mp4", "-i", f"{W}/cashier-wall3a.mov", "-i", f"{W}/cashier-wall3b.mov",
          "-filter_complex",
          "[1:v]scale=430:-1[ca];[2:v]setpts=PTS+7.3/TB,scale=430:-1[cb];"
          "[0:v][ca]overlay=x=W-w-36:y=H-h-28:enable='lt(t,3.2)'[v1];"
          "[v1][cb]overlay=x=W-w-36:y=H-h-28[v]",
          "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", f"{W}/s4.mp4"])

# ---- S5 climax (6.5) ----------------------------------------------------------
still(HOME, 4.9, f"{W}/c1.mp4", vf="eq=brightness=-0.35:saturation=0.9")
cut(CON, 13.9, 1.6, f"{W}/c2.mp4")
concat([f"{W}/c1.mp4", f"{W}/c2.mp4"], f"{W}/s5-raw.mp4")
overlay(f"{W}/s5-raw.mp4", f"{W}/cashier-climax.mov", f"{W}/s5.mp4", enable="lt(t,4.85)")

# ---- S6 end card (2.0) ---------------------------------------------------------
cut(CARD, 0, 2.0, f"{W}/s6.mp4")

def normalize(path, target):
    tmp = path + ".norm.mp4"
    run(FF + ["-i", path, "-vf", "tpad=stop_mode=clone:stop_duration=2,fps=24,format=yuv420p",
              "-t", str(target), "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", tmp])
    os.replace(tmp, path)

for seg, target in [("s1", 17.0), ("s2", 10.5), ("s3", 9.0), ("s4", 10.0), ("s5", 6.5)]:
    normalize(f"{W}/{seg}.mp4", target)

# ---- final: concat + global audio timeline ------------------------------------
segs = [f"{W}/s{i}.mp4" for i in range(7)]
concat(segs, f"{W}/video.mp4")

# audio inputs: (file, delay_ms, volume, atrim_s or None)
A = [
    (f"{S}/out/keystrokes.wav", 0, 0.5, None),
    (f"{V}/n-hook.wav", 150, 1.0, None),
    (f"{V}/n-act1a.wav", 4400, 1.0, None),
    (f"{V}/n-act1b.wav", 8500, 1.0, None),
    (f"{V}/n-w1a.wav", 21250, 1.0, None),
    (f"{V}/c-w1.wav", 26350, 1.0, None),
    (f"{V}/n-w1b.wav", 27450, 1.0, None),
    (f"{S}/out/roomtone.wav", 30390, 1.0, 1.2),
    (f"{V}/n-w2a.wav", 31750, 1.0, None),
    (f"{V}/n-w2b.wav", 36650, 1.0, None),
    (f"{S}/out/thunk.wav", 38200, 0.9, None),
    (f"{S}/out/roomtone.wav", 38910, 1.0, 1.6),
    (f"{V}/n-w3a.wav", 40700, 1.0, None),
    (f"{V}/n-w3b.wav", 43880, 1.0, None),
    (f"{V}/c-w3.wav", 48000, 1.0, None),
    (f"{S}/out/roomtone.wav", 49460, 1.0, 1.1),
    (f"{V}/c-climax.wav", 50700, 1.0, None),
]
inputs = []
fc = []
for i, (path, delay, vol, trim) in enumerate(A):
    inputs += ["-i", path]
    chain = f"[{i + 1}:a]aresample=44100"
    if trim:
        chain += f",atrim=0:{trim}"
    chain += f",adelay={delay}:all=1,volume={vol},apad[a{i}]"
    fc.append(chain)
fc.append("".join(f"[a{i}]" for i in range(len(A))) + f"amix=inputs={len(A)}:normalize=0,atrim=0:59,alimiter=limit=0.95[aout]")
run(["ffmpeg", "-y", "-v", "error", "-i", f"{W}/video.mp4"] + inputs +
    ["-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[aout]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
     f"{F}/bounden-demo-master.mp4"])
print("MASTER BUILT")
