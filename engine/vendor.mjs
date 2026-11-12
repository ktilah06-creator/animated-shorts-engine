// Fetches the pinned third-party libraries into vendor/ (git, shallow, sparse). Idempotent.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { P } from "./env.mjs";

const pins = JSON.parse(fs.readFileSync(path.join(P.root, "engine/pins.json"), "utf8"));
const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

export function vendorReady() {
  return Object.entries(pins).every(([name, pin]) => {
    const stamp = path.join(P.vendor, name, ".pinned");
    return fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.ref;
  });
}

export function fetchVendor({ log = console.log } = {}) {
  fs.mkdirSync(P.vendor, { recursive: true });
  for (const [name, pin] of Object.entries(pins)) {
    const dir = path.join(P.vendor, name);
    const stamp = path.join(dir, ".pinned");
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === pin.ref) { log(`vendor ${name}@${pin.ref}: ok`); continue; }
    fs.rmSync(dir, { recursive: true, force: true });
    log(`vendor ${name}@${pin.ref}: fetching ${pin.repo}`);
    git(["clone", "-q", "--depth", "1", "--branch", pin.ref, "--filter=blob:none", "--sparse", pin.repo, dir]);
    git(["sparse-checkout", "set", "--no-cone", ...pin.paths.map((p) => `/${p}`)], dir);
    // files the library generates at build time but that the engine never uses (SMAA / LUT workers)
    for (const s of pin.stubs ?? []) { fs.mkdirSync(path.dirname(path.join(dir, s)), { recursive: true }); fs.writeFileSync(path.join(dir, s), ""); }
    const sha = git(["rev-parse", "HEAD"], dir).trim();
    fs.writeFileSync(stamp, pin.ref + "\n");
    log(`vendor ${name}@${pin.ref}: ${sha}`);
  }
}
