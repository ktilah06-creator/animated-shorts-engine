// Engine self-test: bundle, render (preview size), cache reuse, deterministic re-render, concat, audio mux, library.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { P, ffmpeg } from "./env.mjs";
import { renderFilm, probe } from "./render.mjs";

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
let failed = 0;
const check = (name, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) failed++; };
const quiet = () => {};

export async function selftest() {
  const id = "_selftest";
  fs.rmSync(path.join(P.cache, id), { recursive: true, force: true });

  // 1. first render
  const r1 = await renderFilm(id, { mode: "preview", log: quiet });
  const p1 = r1.report.probe, v = p1.streams.find((s) => s.codec_type === "video");
  check("render: 40 frames, 540x960, 30 fps", v.nb_frames === "40" && v.width === 540 && v.height === 960 && v.r_frame_rate === "30/1",
    `${v.nb_frames} f ${v.width}x${v.height} ${v.r_frame_rate}`);
  check("render: duration 1.333 s", Math.abs(p1.duration - 40 / 30) < 0.02, `${p1.duration} s`);
  const shotFiles = () => fs.readdirSync(path.join(P.cache, id)).filter((f) => f.endsWith(".mp4") && !f.includes(".part."));
  const before = Object.fromEntries(shotFiles().map((f) => [f, sha(path.join(P.cache, id, f))]));
  check("render: one cached file per shot", Object.keys(before).length === 2);

  // 2. unchanged film -> everything from cache
  const r2 = await renderFilm(id, { mode: "preview", log: quiet });
  check("cache: unchanged shots are reused", r2.report.shots.every((s) => s.cached));

  // 3. forced re-render of one shot is bit-identical (deterministic frames + encoder)
  const r3 = await renderFilm(id, { mode: "preview", only: ["s2"], log: quiet });
  const after = Object.fromEntries(shotFiles().map((f) => [f, sha(path.join(P.cache, id, f))]));
  const s2 = Object.keys(after).find((f) => f.startsWith("s2."));
  check("determinism: re-rendered shot is bit-identical", before[s2] === after[s2], s2);
  check("cache: only the forced shot re-rendered", r3.report.shots.filter((s) => !s.cached).map((s) => s.id).join() === "s2");

  // 4. audio mux: exact video length, audio present
  const wav = path.join(P.out, id, "tone.wav");
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ar", "48000", wav]);
  const r4 = await renderFilm(id, { mode: "preview", audio: wav, log: quiet });
  const a = r4.report.probe.streams.find((s) => s.codec_type === "audio");
  check("audio: muxed AAC 48 kHz, padded to picture length", a && a.codec_name === "aac" && a.sample_rate === "48000" && Math.abs(r4.report.probe.duration - 40 / 30) < 0.03,
    `${a?.codec_name} ${a?.sample_rate} ${r4.report.probe.duration} s`);

  // 5. library integrity
  const { validateLibrary } = await import("../tools/asset.mjs");
  const lib = validateLibrary();
  check("library: manifest valid and approved files intact", lib.ok, lib.problems.join("; "));

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  if (failed) process.exitCode = 1;
}
