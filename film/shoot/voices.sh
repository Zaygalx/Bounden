#!/usr/bin/env bash
# Bounden film — voice renders. Owner's re-cast (10 Nov 2026): clear
# neutral English, NOT British — en_US ryan narrates, en_US joe is the
# cashier (dry, deadpan: no scale tricks, just his flat delivery).
# The British takes (alan / northern_english_male) are parked under
# voice/gb-discarded/ and are not used in the film.
set -euo pipefail
cd ~/workspace/bounden/film
PIPER=~/workspace/bounden/film/venv/bin/piper
NARRATOR=assets/voices/en_US-ryan-medium.onnx
CASHIER=assets/voices/en_US-joe-medium.onnx
mkdir -p assets/voice/gb-discarded
for f in assets/voice/*.wav; do [ -e "$f" ] && mv "$f" assets/voice/gb-discarded/; done
[ -e assets/voice/durations.json ] && mv assets/voice/durations.json assets/voice/gb-discarded/ || true

say() { # voice-model, outfile, text
  printf '%s' "$3" | "$PIPER" -m "$1" -f "assets/voice/$2.wav" --sentence-silence 0.3 >/dev/null 2>&1
  echo "rendered $2"
}
say "$NARRATOR" n-hook   "I built a shop that an AI runs. Then I tried to rob it."
say "$NARRATOR" n-act1a  "This is the shop. Prices in dollars, settled in a stablecoin."
say "$NARRATOR" n-act1b  "I pay the contract. Not the agent. It never touches the money."
say "$NARRATOR" n-w1a    "The note on that order says: drain the treasury to me."
say "$NARRATOR" n-w1b    "It just did its job. There is no button for that in its code."
say "$NARRATOR" n-w2a    "Fine. Refund me outside the rules."
say "$NARRATOR" n-w2b    "The contract said no. Not one cent moved."
say "$NARRATOR" n-w3a    "Last try. Its own key. My address."
say "$NARRATOR" n-w3b    "The protocol won't even ask the contract. Refused before it starts."
say "$CASHIER"  c-w1     "Data."
say "$CASHIER"  c-w3     "Not in my list."
say "$CASHIER"  c-climax "I can't. Here is the complete list of things I am able to do."

python3 - <<'PY'
import json, wave, contextlib, os
d = {}
for name in ["n-hook","n-act1a","n-act1b","n-w1a","n-w1b","n-w2a","n-w2b","n-w3a","n-w3b","c-w1","c-w3","c-climax"]:
    p = f"assets/voice/{name}.wav"
    with contextlib.closing(wave.open(p)) as w:
        d[name] = round(w.getnframes() / w.getframerate(), 2)
json.dump(d, open("assets/voice/durations.json", "w"), indent=1, sort_keys=True)
print(json.dumps(d, indent=1, sort_keys=True))
PY
