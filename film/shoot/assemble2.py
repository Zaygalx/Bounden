#!/usr/bin/env python3
"""Bounden demo film — PASS 2 assembly (Script v5, the story).

Rebuilds the film around the v1 takes (same footage, same trims
+/- a breath; honesty notes in docs/FILM.md carry over verbatim)
with the Blender character at the owner's amended size (~500px
tall) and the recorded Script v5 narration (Kokoro am_michael,
64.09s) at the story's natural pace. The 59s map is lifted; the
assembled length is whatever the story needs: 2086 frames =
86.92s.

Timeline (24fps, frame-quantized):
  B0 hook     f0     283f  home still          char on (walk-in)
  B1 choice   f283   304f  take2 catalogue     char on
  B2 purchase f587   334f  take2/term/pickup   char on to f767,
                                               off for the counter
                                               + reveal (evidence)
  B3 wall 1   f921   331f  typing/memo/journal char off f1012-1089
                                               (memo glance)
  B4 wall 2   f1252  218f  term/event/order    char off f1377-1418
                                               (event glance)
  B5 wall 3   f1470  205f  term/panel          char off f1594+
                                               (permission object)
  B6 climax   f1675  348f  dimmed home/panel   char on to f1937,
                                               steps aside + fades,
                                               panel reads clean
  B7 card     f2023   63f  end card            silent
Voice starts (s): hook .90, choice 12.20, purchase 24.75,
wall1 38.60, wall2 52.40, wall3 61.50, climax 70.40.
"""
import glob
import os
import subprocess

F = "/home/hatch/workspace/bounden/film"
R = f"{F}/render"
S = f"{F}/shoot"
V = f"{F}/assets/voice/v5"
W = f"{F}/build2"
LAYER = "/home/hatch/scratch-fig3d/seq-film-layer"
CAP = "/home/hatch/scratch-fig3d/captions-v5"
FF = ["ffmpeg", "-y", "-v", "error"]
os.makedirs(W, exist_ok=True)

OX, OY = 946, 136                      # character layer origin
TOTAL_FRAMES = 2086


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
    print("+", " ".join(cmd[:8]), "…")
    subprocess.run(cmd, check=True)


def cut(src, start, frames, out):
    run(FF + ["-ss", str(start), "-i", src, "-frames:v", str(frames),
              "-vf", "fps=24,scale=1920:1080,format=yuv420p",
              "-c:v", "libx264", "-crf", "16", "-preset", "veryfast",
              "-an", out])


def still(img, frames, out, vf=""):
    filt = "fps=24,scale=1920:1080,format=yuv420p"
    if vf:
        filt = vf + "," + filt
    run(FF + ["-loop", "1", "-framerate", "24", "-i", img,
              "-frames:v", str(frames), "-vf", filt,
              "-c:v", "libx264", "-crf", "16", "-preset", "veryfast",
              "-an", out])


def with_char(base_args, seg_start_frame, frames, out, fade_out=False):
    """Overlay the baked character layer slice for this segment.
    base_args: ffmpeg input args producing the backdrop as [0:v]."""
    fg = "[1:v]format=rgba"
    if fade_out:
        st = (frames - 13) / 24.0
        fg += f",fade=t=out:st={st:.3f}:d=0.542:alpha=1"
    fg += "[fg]"
    cmd = (FF + base_args +
           ["-framerate", "24", "-start_number", str(seg_start_frame + 1),
            "-i", f"{LAYER}/f%04d.png",
            "-frames:v", str(frames),
            "-filter_complex",
            f"[0:v]fps=24,scale=1920:1080,format=yuv420p[bg];{fg};"
            f"[bg][fg]overlay={OX}:{OY}[v]",
            "-map", "[v]", "-c:v", "libx264", "-crf", "16",
            "-preset", "veryfast", out])
    run(cmd)


def seg_video(src, start, seg_frame, frames, out, char=False, fade=False):
    if char:
        with_char(["-ss", str(start), "-i", src], seg_frame, frames, out,
                  fade_out=fade)
    else:
        cut(src, start, frames, out)


def seg_still(img, seg_frame, frames, out, char=False, vf="", fade=False):
    if char:
        filt = "fps=24,scale=1920:1080,format=yuv420p"
        if vf:
            filt = vf + "," + filt
        # still + char: build the backdrop first, then overlay
        tmp = out + ".bg.mp4"
        still(img, frames, tmp, vf=vf)
        with_char(["-i", tmp], seg_frame, frames, out, fade_out=fade)
    else:
        still(img, frames, out, vf=vf)


# ---- segments: (file, builder) in film order -------------------------------
segs = []

seg_still(HOME, 0, 283, f"{W}/b0.mp4", char=True)
segs.append("b0")
seg_video(T2, 25.3, 283, 304, f"{W}/b1.mp4", char=True)
segs.append("b1")
seg_video(T2, 39.0, 587, 86, f"{W}/b2p1.mp4", char=True)
segs.append("b2p1")
seg_video(A1T, 0.6, 673, 48, f"{W}/b2p2.mp4", char=True)
segs.append("b2p2")
seg_video(T2, 134.9, 721, 46, f"{W}/b2p3.mp4", char=True)
segs.append("b2p3")
cut(PICK, 7.9, 53, f"{W}/b2p4.mp4")
segs.append("b2p4")
cut(PTERM, 7.4, 62, f"{W}/b2p5.mp4")
segs.append("b2p5")
cut(PICK, 16.6, 39, f"{W}/b2p6.mp4")
segs.append("b2p6")
seg_video(HOOK, 0, 921, 91, f"{W}/b3w1.mp4", char=True)
segs.append("b3w1")
cut(EXP, 5.8, 77, f"{W}/b3w2.mp4")
segs.append("b3w2")
seg_video(W1T, 0.8, 1089, 101, f"{W}/b3w3.mp4", char=True)
segs.append("b3w3")
seg_video(EXP, 29.8, 1190, 62, f"{W}/b3w4.mp4", char=True)
segs.append("b3w4")
seg_video(W2T, 0.4, 1252, 125, f"{W}/b4w1.mp4", char=True)
segs.append("b4w1")
cut(EXP, 16.2, 41, f"{W}/b4w2.mp4")
segs.append("b4w2")
seg_video(EXP, 41.3, 1418, 52, f"{W}/b4w3.mp4", char=True)
segs.append("b4w3")
seg_video(W3T, 0.2, 1470, 124, f"{W}/b5w1.mp4", char=True)
segs.append("b5w1")
cut(CON, 11.0, 81, f"{W}/b5w2.mp4")
segs.append("b5w2")
seg_still(HOME, 1675, 262, f"{W}/b6c1.mp4", char=True,
          vf="eq=brightness=-0.35:saturation=0.9", fade=True)
segs.append("b6c1")
cut(CON, 13.9, 86, f"{W}/b6c2.mp4")
segs.append("b6c2")
cut(CARD, 0, 63, f"{W}/b7.mp4")
segs.append("b7")

# ---- concat -----------------------------------------------------------------
lst = f"{W}/concat.txt"
with open(lst, "w") as fh:
    for name in segs:
        fh.write(f"file '{W}/{name}.mp4'\n")
run(FF + ["-f", "concat", "-safe", "0", "-i", lst,
          "-vf", "fps=24,format=yuv420p",
          "-c:v", "libx264", "-crf", "16", "-preset", "veryfast",
          "-an", f"{W}/video.mp4"])

# ---- caption pass -------------------------------------------------------------
run(FF + ["-i", f"{W}/video.mp4", "-framerate", "24", "-i", f"{CAP}/f%04d.png",
          "-frames:v", str(TOTAL_FRAMES),
          "-filter_complex", "[0:v][1:v]overlay=0:0[v]",
          "-map", "[v]", "-c:v", "libx264", "-crf", "16",
          "-preset", "veryfast", f"{W}/video-cap.mp4"])

# ---- audio: the story, room tone in the silences, the small sounds ------------
A = [
    (f"{V}/v5-hook.wav", 900, 1.0, None),
    (f"{V}/v5-choice.wav", 12200, 1.0, None),
    (f"{V}/v5-purchase.wav", 24750, 1.0, None),
    (f"{V}/v5-wall1.wav", 38600, 1.0, None),
    (f"{V}/v5-wall2.wav", 52400, 1.0, None),
    (f"{V}/v5-wall3.wav", 61500, 1.0, None),
    (f"{V}/v5-climax.wav", 70400, 1.0, None),
    (f"{S}/out/keystrokes.wav", 38375, 0.45, 3.6),
    (f"{S}/out/thunk.wav", 59083, 0.7, None),
    (f"{S}/out/roomtone.wav", 50950, 0.9, 1.1),
    (f"{S}/out/roomtone.wav", 58500, 0.9, 1.1),
    (f"{S}/out/roomtone.wav", 66450, 0.9, 1.1),
    (f"{S}/out/roomtone.wav", 69792, 0.9, 0.61),
]
inputs = []
fc = []
for i, (path, delay, vol, trim) in enumerate(A):
    inputs += ["-i", path]
    chain = f"[{i + 1}:a]aresample=48000"
    if trim:
        chain += f",atrim=0:{trim}"
    chain += f",adelay={delay}:all=1,volume={vol},apad[a{i}]"
    fc.append(chain)
fc.append("".join(f"[a{i}]" for i in range(len(A))) +
          f"amix=inputs={len(A)}:normalize=0,"
          "loudnorm=I=-16:TP=-1.5:LRA=11,"
          "atrim=0:86.917,afade=t=out:st=86.417:d=0.5[aout]")
run(["ffmpeg", "-y", "-v", "error", "-i", f"{W}/video-cap.mp4"] + inputs +
    ["-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[aout]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
     "-movflags", "+faststart", f"{F}/bounden-demo-master.mp4"])
print("MASTER BUILT")

# ---- X copy -------------------------------------------------------------------
run(FF + ["-i", f"{F}/bounden-demo-master.mp4",
          "-vf", "scale=1280:720", "-c:v", "libx264", "-crf", "20",
          "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart", f"{F}/bounden-demo-x.mp4"])
print("X COPY BUILT")
