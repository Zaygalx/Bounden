#!/usr/bin/env python3
"""Record the Script v5 narration (the owner's approved story lines).

Voice: Kokoro-82M (kokoro-onnx build) — a neural voice, chosen because
the owner found Piper's joe too synthetic and asked for "more human".
Clear neutral American English, warm adult male: am_michael, natural
pace (speed 1.0). The owner's ruling (10 Nov, 08:59 WAT): the story's
natural pacing governs; nothing is tightened or trimmed to a clock,
and the true total duration is reported.

Run with the scratch TTS env:
  ~/scratch-fig/ttsenv/bin/python voices-v5.py \
      --model ~/scratch-fig/kokoro-v1.0.onnx \
      --voices ~/scratch-fig/voices-v1.0.bin

Outputs: film/assets/voice/v5/v5-<line>.wav per line, sentence
timings in film/assets/voice/v5/v5-hook-sentences.json (for the
proof reel's captions and cues), durations merged into
film/assets/voice/durations.json.
"""
import argparse
import json
import os
import sys

import espeakng_loader

# phonemizer (kokoro-onnx's G2P) needs espeak-ng: use the loader's
# bundled library and data instead of a system install.
espeakng_loader.make_library_available()
os.environ.setdefault("ESPEAK_DATA_PATH", str(espeakng_loader.get_data_path()))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

FILM = "/home/hatch/workspace/bounden/film"
OUTDIR = os.path.join(FILM, "assets/voice/v5")
VOICE = "am_michael"
PAUSE = 0.22  # seconds of silence between sentences inside a line

# The approved Script v5 lines, split into sentences for synthesis.
# Joining each list with single spaces reproduces the approved line
# verbatim — the script asserts that before recording anything.
LINES = {
    "v5-hook": [
        "I'm the cashier of this shop.",
        "Yesterday, a young developer came to me.",
        "He needed credits for his work, but the last seller he paid "
        "had run away with his money.",
    ],
    "v5-choice": [
        "So I told him: don't trust my smile.",
        "Read my rules.",
        "Everything here is open, and my key can only do two things.",
        "He read them.",
        "And he stayed.",
    ],
    "v5-purchase": [
        "He paid ten dollars.",
        "I checked the money, opened his sealed code, and gave it to him.",
        "Only his wallet can open it.",
        "He got exactly what he came for.",
    ],
    "v5-wall1": [
        "But he asked me: what if you turn bad one day?",
        "So I showed him.",
        "I hid a secret order inside a payment: send me all the money.",
        "The shop read it as just words.",
        "Nothing moved.",
    ],
    "v5-wall2": [
        "I tried to refund myself from an old order.",
        "Too late, said the contract.",
        "Refused.",
    ],
    "v5-wall3": [
        "I tried my own key on the shop's money directly.",
        "It won't even start.",
    ],
    "v5-climax": [
        "That is why he could buy from me without knowing me.",
        "I can't steal from this shop.",
        "Not won't.",
        "Can't.",
        "Here is everything I am able to do.",
    ],
}

APPROVED = {
    "v5-hook": "I'm the cashier of this shop. Yesterday, a young "
    "developer came to me. He needed credits for his work, but the "
    "last seller he paid had run away with his money.",
    "v5-choice": "So I told him: don't trust my smile. Read my rules. "
    "Everything here is open, and my key can only do two things. "
    "He read them. And he stayed.",
    "v5-purchase": "He paid ten dollars. I checked the money, opened "
    "his sealed code, and gave it to him. Only his wallet can open "
    "it. He got exactly what he came for.",
    "v5-wall1": "But he asked me: what if you turn bad one day? So I "
    "showed him. I hid a secret order inside a payment: send me all "
    "the money. The shop read it as just words. Nothing moved.",
    "v5-wall2": "I tried to refund myself from an old order. Too "
    "late, said the contract. Refused.",
    "v5-wall3": "I tried my own key on the shop's money directly. "
    "It won't even start.",
    "v5-climax": "That is why he could buy from me without knowing "
    "me. I can't steal from this shop. Not won't. Can't. Here is "
    "everything I am able to do.",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--voice", default=VOICE)
    a = ap.parse_args()

    for name, sents in LINES.items():
        joined = " ".join(sents)
        assert joined == APPROVED[name], f"{name} drifted from the approved line"

    kokoro = Kokoro(a.model, a.voices)
    os.makedirs(OUTDIR, exist_ok=True)
    durations = {}
    hook_windows = []
    total = 0.0

    for name, sents in LINES.items():
        parts = []
        cursor = 0.0
        sr = 24000
        for s in sents:
            samples, sr = kokoro.create(s, voice=a.voice, speed=1.0, lang="en-us")
            dur = len(samples) / sr
            if name == "v5-hook":
                hook_windows.append(
                    {"text": s, "start": round(cursor, 3), "dur": round(dur, 3)}
                )
            parts.append(samples)
            cursor += dur
            parts.append(np.zeros(int(PAUSE * sr), dtype=np.float32))
            cursor += PAUSE
        audio = np.concatenate(parts[:-1])  # drop trailing pause
        dur_total = len(audio) / sr
        durations[name] = round(dur_total, 2)
        total += dur_total
        out = os.path.join(OUTDIR, f"{name}.wav")
        sf.write(out, audio, sr)
        print(f"{name}: {dur_total:.2f}s -> {out}")

    with open(os.path.join(OUTDIR, "v5-hook-sentences.json"), "w") as f:
        json.dump(hook_windows, f, indent=1)

    dpath = os.path.join(FILM, "assets/voice/durations.json")
    with open(dpath) as f:
        merged = json.load(f)
    merged.update(durations)
    with open(dpath, "w") as f:
        json.dump(merged, f, indent=1, sort_keys=True)

    print(f"TOTAL v5 narration: {total:.2f}s across {len(durations)} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
