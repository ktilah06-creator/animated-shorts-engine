#!/usr/bin/env python3
"""Shorten over-long pauses in a voice-over WITHOUT touching speech: every pause longer than its cap keeps cap/2 of
silence on each side and loses its middle, joined with 15 ms crossfades. Words, pitch and speaking speed are unchanged.
usage: tighten.py <in audio> <cues.json> <out.wav> [sentence_cap=0.35] [inner_cap=0.18]
Writes the new audio and prints the edit list (original time -> removed seconds) as JSON on stdout.
"""
import json, subprocess, sys, wave
import numpy as np

src, cues_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
cap_s = float(sys.argv[4]) if len(sys.argv) > 4 else 0.35
cap_i = float(sys.argv[5]) if len(sys.argv) > 5 else 0.18
SR = 48000
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
x = np.frombuffer(raw, np.float32).astype(np.float64)
cues = json.load(open(cues_path))
ends = [s["t1"] for s in cues.get("sentences", [])]
cuts = []
for a, b in cues["pauses"]:
    cap = cap_s if any(abs(a - e) < 0.25 for e in ends) else cap_i
    if b - a > cap + 0.02:
        c0, c1 = a + cap / 2, b - cap / 2
        cuts.append((c0, c1))
X = int(0.015 * SR)
pieces, pos = [], 0
for c0, c1 in cuts:
    i0, i1 = int(c0 * SR), int(c1 * SR)
    pieces.append(x[pos:i0 + X]); pos = i1
pieces.append(x[pos:])
y = pieces[0]
ramp = np.linspace(0, 1, X)
for p in pieces[1:]:
    y = np.concatenate([y[:-X], y[-X:] * (1 - ramp) + p[:X] * ramp, p[X:]])
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(3); w.setframerate(SR)
    v = np.clip(y, -1, 1) * (2 ** 23 - 1)
    b = v.astype(np.int32).astype("<i4").tobytes()
    w.writeframes(b"".join(b[i:i + 3] for i in range(0, len(b), 4)))
json.dump({"in_s": round(len(x) / SR, 3), "out_s": round(len(y) / SR, 3), "caps": [cap_s, cap_i],
           "edits": [{"at": round(c0, 3), "removed": round(c1 - c0, 3)} for c0, c1 in cuts]}, sys.stdout, indent=1)
