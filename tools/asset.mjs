#!/usr/bin/env node
// Asset library tool. Approved versions are immutable; changes always become a new version.
//
//   node tools/asset.mjs search <words...> [--type character]     search approved assets AND staging (reuse first)
//   node tools/asset.mjs list [--type t]                           all assets with their versions
//   node tools/asset.mjs show <type/name>[@v]                      full record
//   node tools/asset.mjs stage <type/name> [files...] [--from dir] put files under review in library/staging/<type>/<name>/
//        --kind original|external|generated --creator "..." --url <source page> --license CC0-1.0 --license-url <url>
//        --attribution "..." --modifications "..." --tags a,b,c --description "..." --entry file
//   node tools/asset.mjs promote <type/name> [--note "..."]         staging -> new approved version vNNN (never overwrites)
//   node tools/asset.mjs validate                                   required fields, licenses, file hashes
//   node tools/asset.mjs credits                                    write library/attribution_credits.md
//
// Staging layout: library/staging/<type>/<name>/asset.json (the draft record), the asset files, and _license/ with
// the license evidence (saved license page / license text). Films can never import staging files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIB, TYPES, loadManifest, saveManifest, verifyVersion, listFiles, sha256, vdir } from "../library/lib.mjs";

const STAGING = path.join(LIB, "staging");
const LICENSES = path.join(LIB, "licenses");
const CHANGELOG = path.join(LIB, "asset_change_log.md");

/** Licenses the channel may use commercially. NC (non-commercial) and ND (no-derivatives) are never accepted. */
export const LICENSES_OK = {
  "CC0-1.0": { attribution: false }, "CC-BY-4.0": { attribution: true }, "CC-BY-3.0": { attribution: true },
  "MIT": { attribution: true }, "Apache-2.0": { attribution: true }, "Zlib": { attribution: false }, "OFL-1.1": { attribution: false },
  "BSD-3-Clause": { attribution: true }, "Original": { attribution: false },
};

const today = () => new Date().toISOString().slice(0, 10);
const idOk = (id) => /^[a-z0-9-]+\/[a-z0-9_.-]+$/.test(id) && TYPES.includes(id.split("/")[0]);
const get = (o, k) => k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);

function checkRecord(r, { forPromote = false } = {}) {
  const errs = [];
  if (!r.source?.kind || !["original", "external", "generated"].includes(r.source.kind)) errs.push("source.kind must be original | external | generated");
  if (!r.source?.creator) errs.push("source.creator is required");
  if (r.source?.kind === "external" && !r.source?.url) errs.push("external assets need source.url (the asset's own page)");
  if (r.source?.kind === "generated" && !r.source?.tool) errs.push("generated assets need source.tool (which generator / code made it)");
  const lic = r.license?.id;
  if (!lic) errs.push("license.id is required");
  else if (/-NC|-ND|NonCommercial|NoDeriv/i.test(lic)) errs.push(`license ${lic} is not allowed (non-commercial / no-derivatives)`);
  else if (!LICENSES_OK[lic]) errs.push(`license ${lic} is not on the accepted list (${Object.keys(LICENSES_OK).join(", ")})`);
  else if (LICENSES_OK[lic].attribution && !r.license?.attribution) errs.push(`license ${lic} requires license.attribution text`);
  if (r.source?.kind === "external" && !r.license?.url) errs.push("external assets need license.url (where the license was read)");
  if (forPromote && r.source?.kind === "external" && !(r.license?.evidence?.length)) errs.push("external assets need license evidence in _license/ (saved license page or text)");
  return errs;
}

// ---------------------------------------------------------------- commands
export function search(words, type) {
  const m = loadManifest();
  const q = words.map((w) => w.toLowerCase());
  const score = (text) => q.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const hits = [];
  for (const [id, a] of Object.entries(m.assets)) {
    if (type && a.type !== type) continue;
    const latest = Math.max(...Object.keys(a.versions).map(Number));
    const text = [id, a.description, ...(a.tags ?? []), ...Object.values(a.versions).map((v) => v.modifications ?? "")].join(" ").toLowerCase();
    const s = q.length ? score(text) : 1;
    if (s) hits.push({ where: "approved", id: `${id}@${latest}`, score: s, description: a.description ?? "", tags: a.tags ?? [] });
  }
  if (fs.existsSync(STAGING)) {
    for (const t of fs.readdirSync(STAGING)) for (const n of fs.readdirSync(path.join(STAGING, t))) {
      const rf = path.join(STAGING, t, n, "asset.json");
      const r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, "utf8")) : {};
      if (type && t !== type) continue;
      const s = q.length ? score([`${t}/${n}`, r.description ?? "", ...(r.tags ?? [])].join(" ").toLowerCase()) : 1;
      if (s) hits.push({ where: "staging", id: `${t}/${n}`, score: s, description: r.description ?? "", tags: r.tags ?? [] });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function stage(id, files, opts) {
  if (!idOk(id)) throw new Error(`asset id must be <type>/<name> with type one of: ${TYPES.join(", ")}`);
  const dir = path.join(STAGING, id);
  fs.mkdirSync(path.join(dir, "_license"), { recursive: true });
  const src = opts.from ? listFiles(opts.from).map((f) => [path.join(opts.from, f), f]) : files.map((f) => [f, path.basename(f)]);
  for (const [from, rel] of src) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(from, path.join(dir, rel)); }
  const rf = path.join(dir, "asset.json");
  const r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, "utf8")) : {};
  const set = (k, v) => { if (v !== undefined) { const ks = k.split("."); let o = r; for (const p of ks.slice(0, -1)) o = o[p] ??= {}; o[ks.at(-1)] = v; } };
  set("description", opts.description); set("tags", opts.tags?.split(",").map((s) => s.trim()).filter(Boolean)); set("entry", opts.entry);
  set("source.kind", opts.kind); set("source.creator", opts.creator); set("source.url", opts.url); set("source.tool", opts.tool);
  set("source.retrieved", opts.url ? today() : undefined);
  set("license.id", opts.license); set("license.url", opts["license-url"]); set("license.attribution", opts.attribution);
  set("modifications", opts.modifications); set("format", opts.format);
  fs.writeFileSync(rf, JSON.stringify(r, null, 2) + "\n");
  return { dir, record: r, problems: checkRecord(r) };
}

export function promote(id, { note } = {}) {
  const dir = path.join(STAGING, id);
  const rf = path.join(dir, "asset.json");
  if (!fs.existsSync(rf)) throw new Error(`nothing staged for ${id} (expected ${path.relative(LIB, rf)})`);
  const draft = JSON.parse(fs.readFileSync(rf, "utf8"));
  const evidence = fs.existsSync(path.join(dir, "_license")) ? listFiles(path.join(dir, "_license")) : [];
  draft.license = { ...(draft.license ?? {}), evidence };
  const errs = checkRecord(draft, { forPromote: true });
  const files = listFiles(dir).filter((f) => f !== "asset.json" && !f.startsWith("_license/"));
  if (!files.length) errs.push("no asset files staged");
  if (draft.entry && !files.includes(draft.entry)) errs.push(`entry ${draft.entry} is not among the staged files`);
  if (errs.length) throw new Error(`cannot promote ${id}:\n  - ` + errs.join("\n  - "));

  const m = loadManifest();
  const [type, name] = id.split("/");
  const a = (m.assets[id] ??= { type, name, description: draft.description ?? "", tags: draft.tags ?? [], versions: {} });
  const prev = Object.keys(a.versions).map(Number);
  const v = prev.length ? Math.max(...prev) + 1 : 1;
  const rel = path.posix.join("assets", type, name, vdir(v));
  const dest = path.join(LIB, rel);
  if (fs.existsSync(dest)) throw new Error(`${rel} already exists: refusing to overwrite an approved version`);
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true }); fs.copyFileSync(path.join(dir, f), path.join(dest, f)); }
  const licDest = path.join(LICENSES, type, name, vdir(v));
  for (const f of evidence) { fs.mkdirSync(path.dirname(path.join(licDest, f)), { recursive: true }); fs.copyFileSync(path.join(dir, "_license", f), path.join(licDest, f)); }
  const rec = {
    status: "approved", path: rel, entry: draft.entry ?? null, format: draft.format ?? path.extname(draft.entry ?? files[0]).slice(1),
    files: Object.fromEntries(files.map((f) => [f, sha256(path.join(dest, f))])),
    created: today(), source: draft.source, license: { ...draft.license, evidencePath: evidence.length ? path.posix.join("licenses", type, name, vdir(v)) : null },
    modifications: draft.modifications ?? "", note: note ?? "", supersedes: prev.length ? Math.max(...prev) : null, usedBy: [],
  };
  a.versions[String(v)] = rec;
  if (draft.description) a.description = draft.description;
  if (draft.tags) a.tags = draft.tags;
  saveManifest(m);
  fs.appendFileSync(CHANGELOG, `- ${today()}  ${id}@${v} approved${rec.supersedes ? ` (supersedes @${rec.supersedes})` : ""}: ${note ?? draft.description ?? ""}\n`);
  fs.rmSync(dir, { recursive: true, force: true }); // the staging copy is now the approved version
  writeCredits();
  return { id: `${id}@${v}`, path: rel, record: rec };
}

export function validateLibrary() {
  const m = loadManifest();
  const problems = [];
  for (const [id, a] of Object.entries(m.assets)) {
    if (!idOk(id)) problems.push(`${id}: bad id`);
    for (const [v, r] of Object.entries(a.versions)) {
      if (r.path !== path.posix.join("assets", ...id.split("/"), vdir(v))) problems.push(`${id}@${v}: path ${r.path} does not match its id/version`);
      for (const e of checkRecord(r)) problems.push(`${id}@${v}: ${e}`);
      for (const e of verifyVersion(r)) problems.push(`${id}@${v}: ${e}`);
    }
  }
  // approved folders that the manifest does not know about (e.g. copied by hand)
  const root = path.join(LIB, "assets");
  if (fs.existsSync(root)) for (const t of fs.readdirSync(root)) for (const n of fs.readdirSync(path.join(root, t))) for (const v of fs.readdirSync(path.join(root, t, n))) {
    const ver = String(Number(v.slice(1)));
    if (!m.assets[`${t}/${n}`]?.versions[ver]) problems.push(`assets/${t}/${n}/${v}: folder not in the manifest`);
  }
  return { ok: problems.length === 0, problems };
}

/** Records which film uses which versions (called after a render); returns the lock object. */
export function recordUsage(film, ids) {
  const m = loadManifest();
  let changed = false;
  const lock = {};
  for (const s of ids) {
    const [id, v] = s.split("@");
    const r = m.assets[id]?.versions[v];
    if (!r) continue;
    lock[s] = r.files;
    if (!r.usedBy.includes(film)) { r.usedBy.push(film); r.usedBy.sort(); changed = true; }
  }
  if (changed) saveManifest(m);
  return lock;
}

export function writeCredits() {
  const m = loadManifest();
  const lines = ["# Attribution credits", "", "Generated by `node tools/asset.mjs credits` from library/manifest.json. Do not edit by hand.", ""];
  const need = [], other = [];
  for (const [id, a] of Object.entries(m.assets)) for (const [v, r] of Object.entries(a.versions)) {
    const row = `- **${id}@${v}**: ${r.source?.creator ?? "?"}${r.source?.url ? `, <${r.source.url}>` : ""}; license ${r.license?.id}${r.license?.url ? ` (<${r.license.url}>)` : ""}${r.modifications ? `; modified: ${r.modifications}` : ""}`;
    (r.license?.attribution ? need : other).push(r.license?.attribution ? `${row}\n  - Credit line: ${r.license.attribution}` : row);
  }
  lines.push("## Attribution required", "", ...(need.length ? need : ["(none)"]), "", "## No attribution required (recorded for provenance)", "", ...(other.length ? other : ["(none)"]), "");
  fs.writeFileSync(path.join(LIB, "attribution_credits.md"), lines.join("\n"));
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {}, pos = [];
  for (let i = 0; i < rest.length; i++) rest[i].startsWith("--") ? (opts[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true) : pos.push(rest[i]);
  try {
    if (cmd === "search" || cmd === "list") {
      const hits = search(cmd === "list" ? [] : pos, opts.type);
      if (!hits.length) console.log("no matches (approved or staging) - search free sources next, create only if nothing fits");
      for (const h of hits) console.log(`${h.where.padEnd(8)} ${h.id.padEnd(36)} ${h.description}${h.tags.length ? `  [${h.tags.join(", ")}]` : ""}`);
    } else if (cmd === "show") {
      const [id, v] = pos[0].split("@");
      const a = loadManifest().assets[id];
      console.log(JSON.stringify(v ? a?.versions[v] : a, null, 2));
    } else if (cmd === "stage") {
      const r = stage(pos[0], pos.slice(1), opts);
      console.log(`staged ${pos[0]} in ${path.relative(process.cwd(), r.dir)}`);
      if (r.problems.length) console.log("still missing before promote:\n  - " + r.problems.join("\n  - "));
    } else if (cmd === "promote") {
      const r = promote(pos[0], { note: opts.note });
      console.log(`approved ${r.id} -> library/${r.path}`);
    } else if (cmd === "validate") {
      const r = validateLibrary();
      console.log(r.ok ? "library OK" : "library problems:\n  - " + r.problems.join("\n  - "));
      if (!r.ok) process.exitCode = 1;
    } else if (cmd === "credits") {
      writeCredits(); console.log("wrote library/attribution_credits.md");
    } else {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).join("\n").replace(/^\/\/ ?/gm, ""));
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
