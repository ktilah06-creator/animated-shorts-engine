// Optional timing cues (from engine/cues.py, `node engine/cli.mjs cues`). Films work without them: every lookup has
// a fallback, so a film can be laid out by hand first and snapped to the voice-over once cues exist.
//   import data from "./cues.json";  const cues = makeCues(data, 30);
//   cues.sentence(4).a            first frame of sentence 5
//   cues.word("unleashed", 0, 600) frame where that word starts (first match at/after the hint frame), or the fallback
export type CueData = { duration: number; sentences?: { text: string; t0: number; t1: number }[]; words?: { w: string; t0: number; t1: number }[]; pauses?: number[][] };

export function makeCues(data: CueData | null | undefined, fps = 30) {
  const F = (t: number) => Math.round(t * fps);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    frames: data ? Math.ceil(data.duration * fps) : 0,
    frame: F,
    sentence(i: number, fallback?: { a: number; b: number }) {
      const s = data?.sentences?.[i];
      if (!s) { if (fallback) return fallback; throw new Error(`no cue for sentence ${i}`); }
      return { a: F(s.t0), b: F(s.t1), text: s.text };
    },
    word(w: string, after = 0, fallback?: number) {
      const k = norm(w);
      const hit = data?.words?.find((x) => norm(x.w) === k && F(x.t0) >= after);
      if (!hit) { if (fallback !== undefined) return fallback; throw new Error(`no cue for word "${w}" after frame ${after}`); }
      return F(hit.t0);
    },
  };
}
