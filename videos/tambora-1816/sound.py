# Sound for "The Year Without a Summer": an original score + SFX placed from the film's timeline (shots and sound
# events exported by `node engine/cli.mjs timeline`), mixed with the voice-over by audio/mixer.py.
#   usage: sound.py <timeline.json> <out dir> <voice file>
# Writes music.wav, sfx.wav, mix.wav and mix_report.json into <out dir>. Deterministic (fixed seeds).
import json
import os
import sys
import numpy as np
from dsp import SR, ns, rng, place, pan, st, fades, make_ir, convolve_st, write_wav, dbg, lp, hp
import instruments as I
import fx
import mixer

tl = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
VOICE = sys.argv[3]
FPS = tl["fps"]
DUR = tl["frames"] / FPS
N = ns(DUR)
shot = {s["id"]: (s["a"] / FPS, s["b"] / FPS) for s in tl["shots"]}
boom_t = next(e["f"] / FPS for e in tl["sound"] if e["kind"] == "boom")
title_t = next(e["f"] / FPS for e in tl["sound"] if e["kind"] == "chime")   # closing title card

def m(n):  # note name -> frequency, e.g. "F4", "Bb3", "C#5"
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    k = names[n[0]] + (1 if "#" in n else -1 if (len(n) > 2 and n[1] == "b") else 0)
    octv = int(n[-1])
    return I.m2f(12 * (octv + 1) + k)

def chord(*ns_):
    return [m(x) for x in ns_]

# ---------------------------------------------------------------- score
mus = np.zeros((2, N))
R = rng(1816)

def pad_at(t0, t1, notes, vel=0.35, warm=900, att=0.8, rel=1.2):
    place(mus, I.pad(chord(*notes), max(0.2, t1 - t0), vel=vel, r=rng(int(t0 * 1000)), att=att, rel=rel, warm=warm), t0)

def arp(t0, t1, notes, step, vel=0.4, inst="pluck", pattern=None, bright=0.45, pn=0.0):
    seq = pattern or list(range(len(notes)))
    t, i = t0, 0
    while t < t1 - 0.05:
        f = m(notes[seq[i % len(seq)]])
        r = rng(int(t * 997) + i)
        if inst == "pluck": x = I.pluck(f, vel=vel, r=r, dur=1.1, bright=bright)
        elif inst == "glock": x = I.glock(f, vel=vel, r=r, dur=1.6)
        elif inst == "box": x = I.musicbox(f, vel=vel, r=r, dur=1.6)
        else: x = I.vibes(f, vel=vel, r=r, dur=1.8)
        place(mus, pan(x, pn + 0.25 * np.sin(i * 1.7)), t)
        t += step; i += 1

def melody(t0, notes, inst="box", vel=0.45, pn=0.1):
    """notes: [(name or None, beats)] at 80 bpm"""
    t = t0
    for name, beats in notes:
        if name:
            r = rng(int(t * 991))
            f = m(name)
            x = {"box": lambda: I.musicbox(f, vel=vel, r=r, dur=1.8), "glock": lambda: I.glock(f, vel=vel, r=r, dur=2.0),
                 "vibes": lambda: I.vibes(f, vel=vel, r=r, dur=2.2)}[inst]()
            place(mus, pan(x, pn), t)
        t += beats * 0.75

B = 0.75  # one beat at 80 bpm
t_reveal, t_globe = shot["02-reveal"][0], shot["03-globe"][0]
# 1-2: the summer leaf -> wonder at the snow over the village
pad_at(0.0, t_reveal + 0.5, ["F3", "A3", "C4", "E4"], 0.32, warm=1100)
melody(0.3, [("F5", 1), ("A5", 1), ("C6", 1), ("A5", 0.5), ("G5", 0.5)], "box", 0.42)
pad_at(t_reveal, t_globe + 0.6, ["Bb2", "F3", "C4", "D4"], 0.3, warm=700, att=0.5)
arp(t_reveal + 0.2, t_globe, ["D6", "F6", "C6", "A5", "G6"], B / 2, 0.22, "glock", pn=0.3)
# 3: the globe: curious plucked arpeggios
t5 = shot["04-eruption"][0]
prog = [("D3", ["D4", "F4", "A4", "E5"]), ("Bb2", ["Bb3", "D4", "F4", "C5"]), ("F3", ["F4", "A4", "C5", "E5"]), ("C3", ["C4", "E4", "G4", "D5"])]
seg = (t5 - t_globe) / len(prog)
for k, (bass, notes) in enumerate(prog):
    pad_at(t_globe + k * seg, t_globe + (k + 1) * seg, [bass] + notes[:3], 0.22, warm=800)
    arp(t_globe + k * seg, t_globe + (k + 1) * seg, notes, B / 2, 0.32, "pluck", pattern=[0, 1, 2, 3, 2, 1])
# 4: Tambora: low drone, rising tension, the blast
pad_at(t5, boom_t, ["D2", "A2", "D3"], 0.36, warm=500, att=2.0)
roll = np.zeros((2, ns(boom_t - t5)))
for k in range(int((boom_t - t5 - 1.5) / 0.12)):
    tk = 1.5 + k * 0.12
    place(roll, I.timpani(m("D2"), vel=0.08 + 0.5 * (k * 0.12 / (boom_t - t5)) ** 2, r=rng(500 + k), dur=0.9), tk)
place(mus, roll, t5)
place(mus, st(I.timpani(m("D2"), vel=1.0, r=rng(9), dur=3.5)), boom_t, 1.6)
place(mus, st(I.brass(m("D2"), 2.5, vel=0.9, r=rng(10), kind="soft")), boom_t, 0.8)
t6 = shot["05-so2"][0]
pad_at(boom_t + 0.3, t6 + 0.5, ["D2", "A2", "F3", "Ab3"], 0.33, warm=600, att=0.6)
# 5-6: explainer pulse (8ths), Dm -> Bb -> Gm -> A
t8 = shot["07-cooling"][0]
prog = [("D3", ["D4", "F4", "A4", "D5"]), ("Bb2", ["D4", "F4", "Bb4", "D5"]), ("G2", ["D4", "G4", "Bb4", "D5"]), ("A2", ["C#4", "E4", "A4", "E5"])]
seg = (t8 - t6) / len(prog)
for k, (bass, notes) in enumerate(prog):
    pad_at(t6 + k * seg, t6 + (k + 1) * seg, [bass] + notes[:3], 0.2, warm=900)
    arp(t6 + k * seg, t6 + (k + 1) * seg, notes, B / 2, 0.3, "pluck", pattern=[0, 2, 1, 3], bright=0.55)
# 7-8: cooling: sparse descending glock over minor pads
t9, t10 = shot["08-north"][0], shot["09-cold"][0]
pad_at(t8, t9, ["G2", "D3", "Bb3", "F4"], 0.3, warm=700)
melody(t8 + 0.3, [("D6", 1.5), ("C6", 1.5), ("Bb5", 1.5)], "glock", 0.3)
pad_at(t9, t10, ["Eb3", "G3", "Bb3", "D4"], 0.3, warm=700)
arp(t9 + 0.3, t10, ["G5", "Bb5", "D6", "F6"], B, 0.18, "glock", pn=-0.3)
# 9-13: hardship: slow vibes melody in D minor
t14 = shot["14-far-beyond"][0]
prog = [("D2", ["D3", "F3", "A3"]), ("Bb1", ["D3", "F3", "Bb3"]), ("G2", ["D3", "G3", "Bb3"]), ("A2", ["C#3", "E3", "A3"])]
seg = (t14 - t10) / 6
for k in range(6):
    bass, notes = prog[k % 4]
    pad_at(t10 + k * seg, t10 + (k + 1) * seg, [bass] + notes, 0.28, warm=650)
    arp(t10 + k * seg, t10 + (k + 1) * seg, [n[:-1] + str(int(n[-1]) + 1) for n in notes], B, 0.22, "pluck", pattern=[0, 1, 2, 1])
melody(t10 + 1.0, [("A4", 2), ("D5", 1), ("F5", 1), ("E5", 2), ("D5", 2), (None, 1), ("C5", 1), ("D5", 1), ("Bb4", 1), ("A4", 4),
                   (None, 2), ("F5", 2), ("E5", 1), ("D5", 1), ("C#5", 2), ("D5", 3)], "vibes", 0.32, pn=-0.15)
# 14: far beyond its birthplace: a broad swell
t15 = shot["15-leaf-frozen"][0]
pad_at(t14, t15 + 0.4, ["D2", "A2", "D3", "F3", "A3"], 0.32, warm=900, att=1.5)
arp(t14 + 0.5, t15, ["D4", "A4", "F5", "A4"], B / 2, 0.28, "pluck", bright=0.6)
sw = np.zeros((2, ns(t15 - t14)))
for k in range(int((t15 - t14 - 2) / 0.1)):
    place(sw, I.timpani(m("A1"), vel=0.05 + 0.3 * (k * 0.1 / (t15 - t14 - 2)) ** 2, r=rng(800 + k), dur=0.8), 2 + k * 0.1)
place(mus, sw, t14)
# 15: the frozen leaf: the opening motif, slower, over a bittersweet chord
place(mus, st(I.timpani(m("D2"), vel=0.55, r=rng(77), dur=2.8)), t15, 1.0)
pad_at(t15, title_t + 0.3, ["Bb2", "F3", "A3", "D4"], 0.32, warm=900)
melody(t15 + 0.3, [("F5", 1.5), ("A5", 1.5), ("C6", 1.5), ("A5", 1)], "glock", 0.4)
melody(t15 + 6.5, [("A5", 2), ("F5", 2), ("D5", 3)], "box", 0.3)
# 16: the title card: resolve and hold to the last frame
pad_at(title_t, DUR, ["D3", "F3", "A3", "D4"], 0.32, warm=900, rel=0.4)
melody(title_t + 0.2, [("D5", 1), ("F5", 1), ("A5", 3)], "glock", 0.36)
mus = mus + convolve_st(mus * 0.35, make_ir(2.4, 3, hf=1.4))
mus[:, -ns(0.8):] *= np.linspace(1, 0, ns(0.8))

# ---------------------------------------------------------------- sfx
sfx = np.zeros((2, N))
for i, e in enumerate(tl["sound"]):
    t, k, g = e["f"] / FPS, e["kind"], e.get("gain", 1.0)
    r = rng(1000 + i)
    d = e.get("dur", 1.0)
    pitch = e.get("pitch", 1.0)
    x = {
        "birds": lambda: fx.birds(d, r), "breeze": lambda: fx.breeze(d, r), "hush": lambda: fx.hush(d, r, 0.5), "space": lambda: fx.space(d, r, 0.35),
        "waves": lambda: fx.waves(d, r), "rumble": lambda: fx.rumble(d, r), "wind": lambda: fx.wind(d, r), "murmur": lambda: fx.murmur(d, r),
        "rain": lambda: fx.rain(d, r, 0.7), "boom": lambda: fx.boom(r), "whoosh": lambda: fx.whoosh(r, dur=e.get("dur", 0.9)),
        "pop": lambda: fx.pop(r, f=880 * pitch), "tick": lambda: fx.tick(r, f=2200 * pitch), "zip": lambda: fx.zip_(r, up=bool(e.get("up", 0))),
        "ting": lambda: fx.chime(r, f=1568, level=0.4, dur=1.2), "sparkle": lambda: sum(fx.chime(rng(1000 + i * 7 + j), f=1760 * pitch * 2 ** (j * 4 / 12), level=0.25, dur=1.6)
                                                                                  for j in range(3)),
        "chime": lambda: fx.chime(r, f=698.5, level=0.7, dur=3.0), "airy": lambda: fx.whoosh(r, dur=d, level=0.5), "clack": lambda: fx.clack(r), "thud": lambda: fx.thud(r),
    }[k]()
    if k == "sparkle":
        x = np.concatenate([x[:ns(0.0)], x])
    place(sfx, x, t, g)
sfx = sfx + convolve_st(sfx * 0.12, make_ir(1.2, 5, hf=1.6))

write_wav(os.path.join(OUT, "music.wav"), mus / max(1e-9, np.abs(mus).max()) * 0.9, 24)
write_wav(os.path.join(OUT, "sfx.wav"), sfx / max(1e-9, np.abs(sfx).max()) * 0.9, 24)
rep = mixer.mix(VOICE, mus, sfx, DUR, os.path.join(OUT, "mix.wav"), target_lufs=-14.0, ceil_db=-2.0, duck_db=-7.0, music_db=-12.0, sfx_db=-11.0,
                report_path=os.path.join(OUT, "mix_report.json"))
print("mix:", json.dumps(rep))
