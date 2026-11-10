#!/usr/bin/env bash
# Bounden film — Script v4 voice renders (rework pass 1, 10 Nov 2026).
# ONE voice: the mascot IS the cashier and does ALL the talking.
# Owner-approved voice: en_US-joe-medium (clear neutral English).
# The separate narrator (en_US ryan) is retired in v4.
set -euo pipefail
cd ~/workspace/bounden/film
PIPER=~/workspace/bounden/film/venv/bin/piper
JOE=assets/voices/en_US-joe-medium.onnx
mkdir -p assets/voice/v4

say() { # outfile, text
  printf '%s' "$2" | "$PIPER" -m "$JOE" -f "assets/voice/v4/$1.wav" --sentence-silence 0.3 >/dev/null 2>&1
  echo "rendered $1"
}
say v4-hook        "Hi, I'm the cashier. This shop is run by me, a computer programme. Let me show you what I can do. And what I can't."
say v4-act1        "A customer pays ten dollars, like this. I check the money arrived. Then I open his sealed code and give it to him. That's my job. Buy, pay, collect."
say v4-act1-collect "Only he can open it, because only his wallet can sign for it."
say v4-w1          "Now I try to rob my own shop. I hide a secret order inside the payment: send all the money to me. Watch. The shop reads it as just words on a receipt. Nothing moves."
say v4-w2          "Next, I try a refund I don't deserve, on an old order. The contract checks its own rules. Too late, it says. Refund rejected."
say v4-w3          "Last try. I use my own key to send the shop's money out directly. My key only opens two doors, and this isn't one of them. It won't even start."
say v4-climax      "I can't steal from this shop. Not won't. Can't. Here is the complete list of things I am able to do."
# Reel-only: first two sentences of the hook, for the ~15s proof reel.
say v4-reel-intro  "Hi, I'm the cashier. This shop is run by me, a computer programme."

python3 - <<'PY'
import json, wave, contextlib
names = ["v4-hook","v4-act1","v4-act1-collect","v4-w1","v4-w2","v4-w3","v4-climax","v4-reel-intro"]
d = {}
for name in names:
    p = f"assets/voice/v4/{name}.wav"
    with contextlib.closing(wave.open(p)) as w:
        d[name] = round(w.getnframes() / w.getframerate(), 2)
# Merge into the shared durations map, keeping the v3 keys intact.
path = "assets/voice/durations.json"
try:
    full = json.load(open(path))
except FileNotFoundError:
    full = {}
full.update(d)
json.dump(full, open(path, "w"), indent=1, sort_keys=True)
print(json.dumps(d, indent=1, sort_keys=True))
print("speech total (script lines):", round(sum(d[k] for k in names if k != "v4-reel-intro"), 2))
PY
