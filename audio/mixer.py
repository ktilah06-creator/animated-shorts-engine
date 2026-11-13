# Generic final mix: voice (gain only) + music (ducked under speech) + SFX -> master at a target integrated loudness
# (default -14 LUFS, YouTube's reference) with a 4x-oversampled look-ahead limiter (true peak <= ceiling).
# Ducking follows the voice's own energy (no word timings needed). Exact length, 48 kHz stereo 24-bit.
import json
import subprocess
import numpy as np
from scipy import ndimage, signal
from dsp import SR, ns, dbg, read_wav, write_wav, integrated, true_peak, short_term


def load_voice(path, dur):
    """any audio file -> stereo float at SR, padded / trimmed to dur"""
    tmp = path + ".mix48k.wav" if not path.endswith(".wav") else None
    src = path
    if tmp:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-ar", str(SR), "-ac", "2", tmp], check=True)
        src = tmp
    x, _sr = read_wav(src)
    if x.ndim == 1:
        x = np.stack([x, x])
    n = ns(dur)
    out = np.zeros((2, n))
    out[:, : min(n, x.shape[1])] = x[:, :n]
    return out


def speech_mask(v, attack=0.06, release=0.35, thresh_db=-38.0):
    """0..1 'someone is talking' curve from the voice's 20 ms RMS, with smooth attack / release"""
    m = v.mean(axis=0)
    hop = ns(0.01)
    rms = np.sqrt(ndimage.uniform_filter1d(m ** 2, ns(0.02)))[::hop] + 1e-9
    on = (20 * np.log10(rms) > thresh_db).astype(float)
    on = ndimage.maximum_filter1d(on, int(0.15 / 0.01))      # bridge short gaps between words
    out = np.zeros_like(on); a, r_ = 0.01 / attack, 0.01 / release
    for i in range(1, len(on)):
        out[i] = out[i - 1] + (on[i] - out[i - 1]) * (a if on[i] > out[i - 1] else r_)
    return np.interp(np.arange(v.shape[1]), np.arange(len(out)) * hop, out)


def limiter(x, ceil_db=-1.0, look=0.005, release=0.08):
    """look-ahead peak limiter on the 4x-oversampled signal (true-peak safe)"""
    up = signal.resample_poly(x, 4, 1, axis=-1)
    peak = np.abs(up).max(axis=0)
    peak = peak.reshape(-1, 4).max(axis=1) if len(peak) % 4 == 0 else np.abs(x).max(axis=0)
    ceil = dbg(ceil_db)
    need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    need = ndimage.minimum_filter1d(need, ns(look) * 2 + 1)
    g = np.empty_like(need); g[0] = need[0]; rc = 1 / ns(release)
    for i in range(1, len(need)):
        g[i] = need[i] if need[i] < g[i - 1] else g[i - 1] + (need[i] - g[i - 1]) * rc
    g = ndimage.uniform_filter1d(g, ns(look))
    return x * np.minimum(g, need)


def mix(voice_path, music, sfx, dur, out_path, target_lufs=-14.0, ceil_db=-1.0, duck_db=-7.0, music_db=-14.0, sfx_db=-12.0, report_path=None):
    """music / sfx are stereo arrays (any level): they are set relative to the voice (LU) before mastering"""
    n = ns(dur)
    fit = lambda a: np.pad(a, ((0, 0), (0, max(0, n - a.shape[1]))))[:, :n] if a is not None else np.zeros((2, n))
    v, m, s = load_voice(voice_path, dur), fit(music), fit(sfx)
    lv = integrated(v)
    def rel(x, db):                                         # set a stem's loudness relative to the voice
        lx = integrated(x) if np.abs(x).max() > 0 else None
        return x * dbg(lv + db - lx) if lx is not None and np.isfinite(lx) else x
    m, s = rel(m, music_db), rel(s, sfx_db)
    mask = speech_mask(v)
    m = m * dbg(duck_db * mask)
    bus = v + m + s
    bus *= dbg(target_lufs - integrated(bus))
    bus = limiter(bus, ceil_db)
    bus *= dbg(target_lufs - integrated(bus))              # re-trim after limiting, then limit again (tiny gain)
    bus = limiter(bus, ceil_db)
    write_wav(out_path, bus, 24)
    rep = {"duration_s": round(bus.shape[1] / SR, 3), "integrated_lufs": round(float(integrated(bus)), 2), "true_peak_dbtp": round(float(true_peak(bus)), 2),
           "voice_lufs_in": round(float(lv), 2), "music_rel_voice_lu": music_db, "sfx_rel_voice_lu": sfx_db, "duck_db": duck_db}
    if report_path:
        with open(report_path, "w") as f:
            json.dump(rep, f, indent=1)
    return rep
