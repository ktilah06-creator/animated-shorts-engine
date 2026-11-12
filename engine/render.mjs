// Drives a bundled film in headless Chrome: stills, per-shot encodes (cached), concat, audio mux.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { P, playwright, chromePath, chromeArgs, ffmpeg, ffprobe } from "./env.mjs";
import { bundleFilm } from "./bundle.mjs";
import { loadManifest, sha256 } from "../library/lib.mjs";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream", ".exr": "application/octet-stream", ".ktx2": "image/ktx2", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".txt": "text/plain" };

/** Static server: / -> .build/<id>/, /film/ -> videos/<id>/public/, /lib/ -> library/assets/ (approved files only) */
function serve(id) {
  const manifest = loadManifest();
  const libUsed = new Set(), verified = new Map();
  const roots = [["/film/", path.join(P.videos, id, "public")], ["/lib/", path.join(P.library, "assets")], ["/", path.join(P.build, id)]];
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/favicon.ico") { res.statusCode = 204; return res.end(); }
    const [prefix, root] = roots.find(([p]) => url.startsWith(p));
    const file = path.normalize(path.join(root, url.slice(prefix.length) || "index.html"));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
    if (prefix === "/lib/") {
      // only files of approved versions, unchanged since approval
      const m = /^([^/]+\/[^/]+)\/v(\d+)\/(.+)$/.exec(url.slice(5));
      const rec = m && manifest.assets[m[1]]?.versions[String(Number(m[2]))];
      const want = rec?.status === "approved" ? rec.files[m[3]] : undefined;
      if (!want) { res.statusCode = 403; return res.end("not an approved library file"); }
      if (!verified.has(file)) verified.set(file, sha256(file) === want);
      if (!verified.get(file)) { res.statusCode = 409; return res.end("library file modified since approval"); }
      libUsed.add(`${m[1]}@${Number(m[2])}`);
    }
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, port: srv.address().port, libUsed })));
}

/** Opens the film in the browser and waits until its setup finished. */
export async function openFilm(id, { scale = 1, post, log = console.log } = {}) {
  const b = await bundleFilm(id, { log });
  const { srv, port, libUsed } = await serve(id);
  const pw = await playwright();
  const browser = await pw.chromium.launch({ executablePath: chromePath(), args: chromeArgs() });
  // viewport = nominal size x scale; the film sizes its own canvas from ?scale
  const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/GL Driver Message|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} for ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, "")}`); });
  const qs = new URLSearchParams({ scale: String(scale), ...(post ? { post: JSON.stringify(post) } : {}) });
  await page.goto(`http://127.0.0.1:${port}/index.html?${qs}`);
  let meta;
  try {
    await page.waitForFunction(() => window.__engine && (window.__engine.meta || window.__engine.error || true), null, { timeout: 30000 });
    meta = await page.evaluate(async () => { try { return await window.__engine.ready; } catch (e) { return { error: String(window.__engine.error || e) }; } });
  } catch (e) { meta = { error: `film did not start: ${e.message}\n${errors.join("\n")}` }; }
  if (!meta || meta.error) { await browser.close(); srv.close(); throw new Error(`film ${id} failed during setup:\n${meta?.error}\n${errors.join("\n")}`); }
  await page.setViewportSize({ width: meta.width, height: meta.height });
  const clip = { x: 0, y: 0, width: meta.width, height: meta.height };
  const capture = async (f) => {
    await page.evaluate((n) => window.__engine.frame(n), f);
    if (errors.length) throw new Error(`frame ${f}: ${errors.join("\n")}`);
    return page.screenshot({ type: "jpeg", quality: 92, clip });
  };
  const close = async () => { await browser.close(); srv.close(); };
  const libVersions = () => [...new Set([...b.libUsed, ...libUsed])].sort();
  return { bundle: b, meta, capture, close, page, libVersions };
}

// ---------------------------------------------------------------- stills
export async function stills(id, frames, { scale = 1, post, outDir, log = console.log } = {}) {
  const film = await openFilm(id, { scale, post, log });
  const dir = outDir ?? path.join(P.out, id, "stills");
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  try {
    for (const f of frames) {
      const t = Date.now();
      const jpg = await film.capture(f);
      const file = path.join(dir, `f${String(f).padStart(5, "0")}${scale !== 1 ? `_s${scale}` : ""}.jpg`);
      fs.writeFileSync(file, jpg);
      files.push(file);
      log(`still f${f}: ${path.relative(P.root, file)} (${Date.now() - t} ms)`);
    }
  } finally { await film.close(); }
  return files;
}

// ---------------------------------------------------------------- video
const PRESETS = {
  final: { crf: 17, preset: "veryfast", scale: 1 },
  preview: { crf: 24, preset: "veryfast", scale: 0.5, post: { multisampling: 0 } },
};

function encoder(file, { fps, crf, preset }) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(fps),
    "-video_track_timescale", String(fps * 512), "-movflags", "+faststart", file];
  const p = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  const done = new Promise((ok, no) => p.on("close", (c) => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c}: ${err}`)))));
  const write = (buf) => new Promise((ok) => (p.stdin.write(buf) ? ok() : p.stdin.once("drain", ok)));
  return { write, end: () => { p.stdin.end(); return done; } };
}

const key = (...parts) => crypto.createHash("sha256").update(parts.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\u0000")).digest("hex").slice(0, 16);

/**
 * Renders every shot to its own file (skipping shots whose cache key is unchanged), joins them without re-encoding,
 * and adds audio if given. Returns { file, report }.
 *   mode: "final" | "preview";  only: [shotIds] forces those shots to re-render;  audio: path to a wav/mp3/m4a.
 */
export async function renderFilm(id, { mode = "final", only, audio, scale, crf, post, log = console.log } = {}) {
  const pr = { ...PRESETS[mode], ...(scale ? { scale } : {}), ...(crf ? { crf } : {}) };
  const postAll = { ...(pr.post ?? {}), ...(post ?? {}) };
  const film = await openFilm(id, { scale: pr.scale, post: Object.keys(postAll).length ? postAll : undefined, log });
  const { meta, bundle } = film;
  const cacheDir = path.join(P.cache, id);
  fs.mkdirSync(cacheDir, { recursive: true });
  const settings = { fps: meta.fps, w: meta.width, h: meta.height, crf: pr.crf, preset: pr.preset, post: postAll, engine: 1 };
  // every library version the film imported or loaded is part of each shot's cache key and of the lock file
  const { recordUsage } = await import("../tools/asset.mjs");
  const lock = recordUsage(id, film.libVersions());
  fs.writeFileSync(path.join(P.videos, id, "assets.lock.json"), JSON.stringify(lock, null, 2) + "\n");
  const report = { id, mode, settings, bundle: bundle.hash.slice(0, 16), shots: [], started: new Date().toISOString() };
  const files = [];
  try {
    for (const s of meta.shots) {
      const k = key(bundle.hash, s, settings, lock);
      const file = path.join(cacheDir, `${s.id}.${mode}.${k}.mp4`);
      const forced = only && only.includes(s.id);
      if (fs.existsSync(file) && !forced) {
        log(`shot ${s.id}: cached (${s.b - s.a} f)`);
        report.shots.push({ id: s.id, frames: s.b - s.a, cached: true });
        files.push(file);
        continue;
      }
      const tmp = file.replace(/\.mp4$/, ".part.mp4");
      const enc = encoder(tmp, { fps: meta.fps, crf: pr.crf, preset: pr.preset });
      const t0 = Date.now();
      for (let f = s.a; f < s.b; f++) {
        await enc.write(await film.capture(f));
        if ((f - s.a) % 30 === 29) log(`shot ${s.id}: ${f - s.a + 1}/${s.b - s.a} f, ${((Date.now() - t0) / (f - s.a + 1) / 1000).toFixed(2)} s/f`);
      }
      await enc.end();
      fs.renameSync(tmp, file); // only a complete encode gets the final name
      const sec = (Date.now() - t0) / 1000;
      log(`shot ${s.id}: rendered ${s.b - s.a} f in ${sec.toFixed(1)} s (${(sec / (s.b - s.a)).toFixed(2)} s/f)`);
      report.shots.push({ id: s.id, frames: s.b - s.a, seconds: +sec.toFixed(1), perFrame: +(sec / (s.b - s.a)).toFixed(3) });
      files.push(file);
    }
  } finally { await film.close(); }

  const outDir = path.join(P.out, id);
  fs.mkdirSync(outDir, { recursive: true });
  // shot table for qa/short_qa.py: planned cuts, crossfades and flashes are not reported as glitches
  const flashes = meta.flashes ?? [];
  fs.writeFileSync(path.join(outDir, "shots.json"), JSON.stringify({
    shots: meta.shots.map((s) => ({ id: s.id, a: s.a, b: s.b })),
    xfade: meta.shots.filter((s) => s.xfade).map((s) => [s.a, s.a + s.xfade]),
    planned: flashes.map((x) => [x.at, x.at + x.len]),
  }, null, 1) + "\n");
  const list = path.join(outDir, `.concat_${mode}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const silent = path.join(outDir, `${id}_${mode}_video.mp4`);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", silent]);
  let final = silent;
  if (audio) {
    final = path.join(outDir, `${id}_${mode}.mp4`);
    const dur = meta.frames / meta.fps;
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-af", `apad=whole_dur=${dur}`, "-t", dur.toFixed(4), "-movflags", "+faststart", final]);
  }
  report.file = path.relative(P.root, final);
  report.probe = probe(final);
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, `render_${mode}.json`), JSON.stringify(report, null, 2) + "\n");
  return { file: final, report };
}

export function probe(file) {
  const j = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels:format=duration",
    "-of", "json", file], { encoding: "utf8" }));
  return { duration: +(+j.format.duration).toFixed(3), streams: j.streams };
}
