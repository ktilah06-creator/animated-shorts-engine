// Locates the tools the engine needs, so the same code runs in the cloud workspace and on a local PC.
// Order: an npm install in this repo (node_modules) -> the tools preinstalled in the cloud workspace.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const P = {
  root: ROOT,
  vendor: path.join(ROOT, "vendor"),
  build: path.join(ROOT, ".build"),
  out: path.join(ROOT, "out"),
  cache: path.join(ROOT, "cache"),
  runtime: path.join(ROOT, "runtime"),
  videos: path.join(ROOT, "videos"),
  library: path.join(ROOT, "library"),
};

const CLOUD_NPM = "/opt/npm-tools/node_modules";

async function importFirst(cands) {
  for (const c of cands) {
    try {
      if (c.startsWith("/") && !fs.existsSync(c)) continue;
      const m = await import(c.startsWith("/") ? pathToFileURL(c).href : c);
      return m.default ?? m;
    } catch { /* try the next */ }
  }
  throw new Error(`none of these could be imported: ${cands.join(", ")}`);
}

export async function esbuild() {
  const nativeBin = path.join(CLOUD_NPM, "@esbuild/linux-x64/bin/esbuild");
  if (!process.env.ESBUILD_BINARY_PATH && fs.existsSync(nativeBin) && !fs.existsSync(path.join(ROOT, "node_modules/esbuild"))) {
    process.env.ESBUILD_BINARY_PATH = nativeBin;
  }
  return importFirst([path.join(ROOT, "node_modules/esbuild/lib/main.js"), path.join(CLOUD_NPM, "esbuild/lib/main.js")]);
}

export async function playwright() {
  return importFirst([path.join(ROOT, "node_modules/playwright/index.mjs"), path.join(CLOUD_NPM, "playwright/index.mjs")]);
}

/** Chrome binary: $CHROME_PATH, then a system Chrome, else undefined (Playwright's own Chromium). */
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [n], { encoding: "utf8" }).trim(); } catch { /* next */ }
  }
  return undefined;
}

/** GPU when there is one; SwiftShader (CPU WebGL2) otherwise. ENGINE_GL=gpu|swiftshader forces one. */
export function chromeArgs() {
  const mode = process.env.ENGINE_GL ?? (process.platform === "linux" && !fs.existsSync("/dev/dri") ? "swiftshader" : "gpu");
  const common = ["--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--hide-scrollbars",
    "--no-first-run", "--disable-sync", "--disable-component-update", "--disable-default-apps", "--disable-features=OptimizationHints,MediaRouter,Translate"];
  return mode === "swiftshader" ? [...common, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [...common, "--enable-gpu", "--use-angle=default"];
}

export const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
export const ffprobe = process.env.FFPROBE ?? "ffprobe";
export const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
