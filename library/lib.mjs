// Asset library core: manifest access, version resolution and integrity checks.
//
// Layout
//   library/manifest.json                         one record per asset, one entry per version
//   library/assets/<type>/<name>/v001/...          APPROVED files (immutable once approved)
//   library/staging/<type>/<name>/...              drafts and downloads under review (never imported by films)
//   library/licenses/<type>/<name>/v001/...        license evidence (page capture, license text)
//
// Rules enforced here and by tools/asset.mjs
//   - An approved version's files are never changed: every file has a sha256 in the manifest and is verified
//     whenever a film imports it, and by `asset validate`. A change means a NEW version (v002), never an overwrite.
//   - Films must pin a version: "@lib/character/scout@1". Unpinned imports are refused.
//   - Every version records source, license and modifications (see REQUIRED below).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const LIB = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST = path.join(LIB, "manifest.json");
export const TYPES = ["character", "expression-set", "model", "environment", "env-module", "prop", "material", "texture",
  "hdri", "lighting-preset", "camera-preset", "animation-pattern", "scene-component", "font", "audio", "effect"];
export const REQUIRED = ["source.kind", "source.creator", "license.id", "created", "files"];

export const vdir = (v) => "v" + String(v).padStart(3, "0");
export const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { schema: 1, assets: {} };
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}
export function saveManifest(m) {
  const sorted = { schema: m.schema, assets: Object.fromEntries(Object.entries(m.assets).sort(([a], [b]) => a.localeCompare(b))) };
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
}

/** "character/scout@1/extra.ts" -> { id: "character/scout", version: 1, sub: "extra.ts" } */
export function parseSpec(spec) {
  const m = /^([a-z0-9-]+\/[a-z0-9_.-]+)@(\d+)(?:\/(.+))?$/.exec(spec);
  if (!m) throw new Error(`library import "${spec}" must look like <type>/<name>@<version>[/file] (versions are always pinned)`);
  return { id: m[1], version: Number(m[2]), sub: m[3] };
}

export function getVersion(m, id, version) {
  const a = m.assets[id];
  if (!a) throw new Error(`library: no asset "${id}"`);
  const v = a.versions[String(version)];
  if (!v) throw new Error(`library: "${id}" has no version ${version} (has ${Object.keys(a.versions).join(", ")})`);
  return { asset: a, rec: v, dir: path.join(LIB, v.path) };
}

/** Recomputes every file hash of a version. Returns a list of problems (empty = intact). */
export function verifyVersion(rec) {
  const dir = path.join(LIB, rec.path);
  const bad = [];
  for (const [f, h] of Object.entries(rec.files ?? {})) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) bad.push(`missing ${rec.path}/${f}`);
    else if (sha256(p) !== h) bad.push(`MODIFIED ${rec.path}/${f} (approved files must never change; make a new version)`);
  }
  if (fs.existsSync(dir)) {
    for (const f of listFiles(dir)) if (!(f in (rec.files ?? {}))) bad.push(`unrecorded file ${rec.path}/${f}`);
  }
  return bad;
}

export function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

/** esbuild hook: resolves a pinned library import to an approved, intact file. */
export function resolveLibImport(spec, importer) {
  const { id, version, sub } = parseSpec(spec);
  const m = loadManifest();
  const { rec, dir } = getVersion(m, id, version);
  if (rec.status !== "approved") throw new Error(`library: ${id}@${version} is "${rec.status}", only approved versions can be imported (from ${importer})`);
  const bad = verifyVersion(rec);
  if (bad.length) throw new Error(`library: ${id}@${version} failed its integrity check:\n  ` + bad.join("\n  "));
  const file = path.join(dir, sub ?? rec.entry ?? "");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) throw new Error(`library: ${id}@${version} has no file "${sub ?? rec.entry}"`);
  return { id: `${id}@${version}`, file };
}

/** URL under which the render server exposes a version's files to the page (for GLBs, textures, fonts, audio). */
export const libUrl = (id, version, file) => `/lib/${m2p(id)}/${vdir(version)}/${file}`;
const m2p = (id) => id;
