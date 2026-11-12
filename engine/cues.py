#!/usr/bin/env python3
"""Optional timing cues from a voice-over: pauses from the audio, words and sentences from the script.

usage: cues.py <audio> [script.txt] > cues.json
Without a script: only speech segments and pauses. With a script: every word gets an estimated time. Sentence and
clause boundaries snap to real pauses (dynamic programming over syllable counts); words inside a phrase are spread
by syllables, so they are approximate (typically within ~0.2 s). Numbers like 1816 are read as "eighteen sixteen".
"""
import json, re, subprocess, sys

def silences(audio, noise="-38dB", d=0.18):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", audio, "-af", f"silencedetect=noise={noise}:d={d}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: (-?[0-9.]+)", out)]
    en = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], capture_output=True, text=True).stdout)
    if len(en) < len(st): en.append(dur)
    return list(zip(st, en)), dur

def year_words(m):
    y = m.group(0); a, b = int(y[:2]), int(y[2:])
    ones = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
    tens = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
    say = lambda n: ones[n] if n < 20 else tens[n // 10] + ("" if n % 10 == 0 else " " + ones[n % 10])
    return f"{say(a)} {'hundred' if b == 0 else ('oh ' + ones[b] if b < 10 else say(b))}"

def syl(w):
    w = re.sub("[^a-z]", "", w.lower())
    if not w: return 0
    s = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and s > 1: s -= 1
    return max(1, s)

def main():
    audio = sys.argv[1]
    sil, dur = silences(audio)
    segs, prev = [], 0.0
    for a, b in sil:
        if a > prev + 0.05: segs.append((prev, a))
        prev = b
    if dur > prev + 0.05: segs.append((prev, dur))
    res = {"audio": audio, "duration": round(dur, 3), "pauses": [[round(a, 3), round(b, 3)] for a, b in sil], "segments": [[round(a, 3), round(b, 3)] for a, b in segs]}
    if len(sys.argv) > 2:
        raw = open(sys.argv[2], encoding="utf8").read().split()
        spoken = [re.sub(r"\b1[0-9]{3}\b", year_words, w) for w in raw]
        ps = [sum(syl(x) for x in w.split()) or 1 for w in spoken]
        N, S = len(raw), len(segs)
        rate = sum(b - a for a, b in segs) / sum(ps)
        punct = lambda j: 0.0 if j == N or re.search(r"[,.…;:!?]$", raw[j - 1]) else 0.6
        cost = lambda i, j, s: (segs[s][1] - segs[s][0] - rate * sum(ps[i:j])) ** 2 + punct(j)
        INF = float("inf")
        dp = [[INF] * (S + 1) for _ in range(N + 1)]; bk = [[None] * (S + 1) for _ in range(N + 1)]
        dp[0][0] = 0
        for s in range(1, S + 1):
            for j in range(1, N + 1):
                for i in range(max(0, j - 60), j):
                    if dp[i][s - 1] < INF:
                        c = dp[i][s - 1] + cost(i, j, s - 1)
                        if c < dp[j][s]: dp[j][s], bk[j][s] = c, i
        if dp[N][S] == INF: sys.exit("could not align: more pauses than words?")
        groups, j = [], N
        for s in range(S, 0, -1):
            i = bk[j][s]; groups.append((i, j, s - 1)); j = i
        words = []
        for i, j, s in reversed(groups):
            a, b = segs[s]; T = sum(ps[i:j]); t = a
            for k in range(i, j):
                d = (b - a) * ps[k] / T
                words.append({"w": raw[k], "t0": round(t, 3), "t1": round(t + d, 3)}); t += d
        sents, cur = [], []
        for w in words:
            cur.append(w)
            if re.search(r"[.!?…]$", w["w"]): sents.append(cur); cur = []
        if cur: sents.append(cur)
        res["words"] = words
        res["sentences"] = [{"text": " ".join(w["w"] for w in s), "t0": s[0]["t0"], "t1": s[-1]["t1"]} for s in sents]
        res["rate_syll_per_s"] = round(1 / rate, 2)
    json.dump(res, sys.stdout, indent=1, ensure_ascii=False)

main()
