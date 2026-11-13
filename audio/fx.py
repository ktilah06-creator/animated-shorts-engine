# Engine-owned sound effects (numpy + scipy synthesis, deterministic by seed). Each returns a mono or stereo float
# array at SR. Built on dsp.py / sfx_gen.py.
import numpy as np
from dsp import SR, ns, tt, rng, lp, hp, bp, peq, colored, smooth_noise, fades, modal, st, pan, curve
import sfx_gen as G


def boom(r, dur=4.5, weight=1.0):
    """volcanic blast: sub thump + cracking burst + long rolling rumble"""
    n = ns(dur); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * (38 + 30 * np.exp(-t / 0.18)) * t) * np.exp(-t / 0.9) * 0.9
    crack = hp(r.standard_normal(n), 900) * np.exp(-t / 0.05) * 0.5
    burst = lp(r.standard_normal(n), 1800) * np.exp(-t / 0.35) * 0.7
    roll = lp(colored(n, r, -2.0), 260, 2) * (1 - np.exp(-t / 0.3)) * np.exp(-t / 1.8) * (0.8 + 0.4 * smooth_noise(n, r, 3.0))
    y = (sub + crack + burst + roll * 1.4) * weight
    return fades(y / max(1e-9, np.abs(y).max()) * 0.95, 0.001, 0.5)


def rumble(dur, r, level=1.0):
    """continuous low eruption roar"""
    n = ns(dur)
    y = lp(colored(n, r, -2.0), 320, 2) * (0.75 + 0.35 * smooth_noise(n, r, 1.5))
    y += bp(colored(n, r, -1.0), 300, 1200) * 0.12 * (0.5 + 0.5 * smooth_noise(n, r, 4.0))
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.4, 0.8)


def rain(dur, r, level=1.0):
    """steady rain: filtered noise bed + many tiny drop ticks, stereo"""
    n = ns(dur)
    out = []
    for ch in range(2):
        rr = rng(r.integers(1 << 30))
        bed = bp(colored(n, rr, -0.6), 900, 7000) * 0.35
        ticks = np.zeros(n)
        k = int(dur * 260)
        pos = rr.integers(0, n - 400, k)
        for p in pos:
            m = 200; tt_ = np.arange(m) / SR
            ticks[p:p + m] += np.sin(2 * np.pi * rr.uniform(2500, 6500) * tt_) * np.exp(-tt_ / 0.0012) * rr.uniform(0.05, 0.25)
        out.append(bed + ticks)
    y = np.stack(out)
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.5, 0.8)


def wind(dur, r, level=1.0, howl=0.4):
    """cold wind with gusts and a soft howl"""
    n = ns(dur); t = np.arange(n) / SR
    g = 0.55 + 0.45 * smooth_noise(n, r, 0.35)
    y = bp(colored(n, r, -1.2), 200, 1500) * g
    f = 340 + 120 * smooth_noise(n, r, 0.25)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y += np.sin(ph) * howl * 0.18 * g ** 2 * (0.6 + 0.4 * smooth_noise(n, r, 0.6))
    y = np.stack([y, np.roll(y, ns(0.013))])
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.6, 0.9)


def hush(dur, r, level=1.0):
    """soft airy snowfall ambience"""
    n = ns(dur)
    y = np.stack([hp(lp(colored(n, rng(r.integers(1 << 30)), -0.3), 5000), 1200) * (0.7 + 0.3 * smooth_noise(n, r, 0.4)) for _ in range(2)])
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.8, 0.8)


def space(dur, r, level=1.0):
    """quiet space bed: low hum + distant shimmer"""
    n = ns(dur); t = np.arange(n) / SR
    hum = sum(np.sin(2 * np.pi * f * t + r.uniform(0, 6.28)) * a for f, a in [(55, 0.5), (82.4, 0.3), (110, 0.18)]) * (0.8 + 0.2 * smooth_noise(n, r, 0.2))
    sh = hp(colored(n, r, 0.0), 6000) * 0.05 * (0.5 + 0.5 * smooth_noise(n, r, 0.5))
    y = st(hum * 0.5 + sh)
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.8, 0.8)


def pop(r, f=880.0, level=0.6):
    """soft UI pop for labels popping in"""
    d = 0.18; t = tt(d)
    y = np.sin(2 * np.pi * (f * (1 + 0.6 * np.exp(-t / 0.012))) * t) * np.exp(-t / 0.045)
    y += hp(r.standard_normal(len(t)), 2000) * np.exp(-t / 0.004) * 0.15
    return fades(y * level, 0.0005, 0.05)


def chime(r, f=1046.5, level=0.6, dur=2.6):
    """bell chime (title, reveals)"""
    y = modal(dur, [(f, 1.0, 1.6), (f * 2.76, 0.35, 0.5), (f * 5.4, 0.12, 0.18), (f * 0.5, 0.25, 1.2)], r)
    return fades(y * level, 0.001, 0.3)


def tick(r, f=2200.0, level=0.4):
    d = 0.05; t = tt(d)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) + hp(r.standard_normal(len(t)), 3000) * np.exp(-t / 0.002) * 0.3
    return fades(y * level, 0.0003, 0.01)


def zip_(r, dur=0.45, up=True, level=0.5):
    """quick drawn-line zip (arrows drawing on)"""
    n = ns(dur); t = np.arange(n) / SR
    f = np.where(up, 600 + 2600 * (t / dur), 3200 - 2400 * (t / dur))
    nz = colored(n, r, 0.0)
    y = np.zeros(n)
    for k in range(0, n, 512):
        seg = nz[k:k + 1024]
        y[k:k + len(seg)] += bp(seg, max(200, f[k] * 0.8), min(SR * 0.45, f[k] * 1.25))[: len(seg)] * np.hanning(len(seg))
    y *= np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.002, 0.03)


def clack(r, level=0.6):
    """wooden sign clack (price board changes)"""
    y = modal(0.25, [(420, 1.0, 0.05), (1180, 0.5, 0.03), (2400, 0.25, 0.012)], r)
    return fades(y * level, 0.0005, 0.02)


def thud(r, level=0.6):
    """soft body thud (kneeling)"""
    d = 0.4; t = tt(d)
    y = np.sin(2 * np.pi * (70 + 40 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.08) + lp(r.standard_normal(len(t)), 900) * np.exp(-t / 0.03) * 0.3
    return fades(y * level, 0.001, 0.05)


def whoosh(r, dur=0.9, level=0.6):
    return G.whoosh(dur, r, peak=0.45) * level


def birds(dur, r, level=0.5):
    return G.bird_chirps(dur, r, density=0.6) * level


def breeze(dur, r, level=0.5):
    return G.breeze(dur, r, level=1.0) * level


def murmur(dur, r, level=0.4):
    """small worried crowd, low"""
    y = sum(G.babble(dur, rng(r.integers(1 << 30)), base=b, scale=s) for b, s in [(110, 1.0), (180, 1.1), (140, 0.9), (210, 1.2)])
    y = lp(y, 2200)
    return fades(y / max(1e-9, np.abs(y).max()) * level, 0.6, 0.6)


def waves(dur, r, level=0.5):
    return G.water_bed(dur, r, close=0.4, slosh_rate=0.25) * level
