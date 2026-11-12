#!/usr/bin/env node
// Engine command line.
//   node engine/cli.mjs vendor                                   fetch pinned three.js + postprocessing
//   node engine/cli.mjs build   <film>                           bundle only (fast syntax/import check)
//   node engine/cli.mjs stills  <film> <f1,f2,..> [--scale 0.5] [--post '{"ink":false}']
//   node engine/cli.mjs render  <film> [--preview] [--only s1,s2] [--audio file.wav] [--scale x] [--crf n]
//   node engine/cli.mjs qa      <video.mp4> [--film <film>]       frame-by-frame technical QA (qa/short_qa.py)
//   node engine/cli.mjs selftest                                 engine checks (bundle, determinism, cache, concat)
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { P, python } from "./env.mjs";
import { fetchVendor } from "./vendor.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const k = rest[i].slice(2);
    if (i + 1 < rest.length && !rest[i + 1].startsWith("--")) flags[k] = rest[++i]; else flags[k] = true;
  } else pos.push(rest[i]);
}
const num = (v) => (v === undefined ? undefined : Number(v));
const post = flags.post ? JSON.parse(flags.post) : undefined;

async function main() {
  switch (cmd) {
    case "vendor": fetchVendor(); break;
    case "build": {
      const { bundleFilm } = await import("./bundle.mjs");
      const b = await bundleFilm(pos[0]);
      console.log(`built ${b.id}: ${path.relative(P.root, b.outDir)}/bundle.js (${b.hash.slice(0, 16)}); library: ${b.libUsed.join(", ") || "none"}`);
      break;
    }
    case "stills": {
      const { stills } = await import("./render.mjs");
      const frames = String(pos[1] ?? "0").split(",").map(Number);
      await stills(pos[0], frames, { scale: num(flags.scale) ?? 1, post, outDir: flags.out });
      break;
    }
    case "render": {
      const { renderFilm } = await import("./render.mjs");
      const { file, report } = await renderFilm(pos[0], {
        mode: flags.preview ? "preview" : "final", only: flags.only ? String(flags.only).split(",") : undefined,
        audio: flags.audio, scale: num(flags.scale), crf: num(flags.crf), post,
      });
      console.log(`wrote ${path.relative(P.root, file)}  ${JSON.stringify(report.probe)}`);
      break;
    }
    case "qa": {
      const video = pos[0];
      const outDir = flags.out ?? path.join(path.dirname(video), "qa");
      const shotsJson = flags.film ? path.join(P.out, flags.film, "shots.json") : undefined;
      execFileSync(python, [path.join(P.root, "qa/short_qa.py"), video, outDir, ...(shotsJson && fs.existsSync(shotsJson) ? [shotsJson] : [])], { stdio: "inherit" });
      break;
    }
    case "selftest": {
      const { selftest } = await import("./selftest.mjs");
      await selftest();
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 9).join("\n").replace(/^\/\/ ?/gm, ""));
      process.exitCode = cmd ? 1 : 0;
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
