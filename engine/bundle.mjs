// Bundles one film (videos/<id>/film.ts + the runtime) into .build/<id>/ for the headless browser.
//   import "three"                      -> vendor/three/build/three.module.js
//   import "three/addons/..."           -> vendor/three/examples/jsm/...   ("three/examples/jsm/..." works too)
//   import "postprocessing"             -> vendor/postprocessing/src/index.js (shaders as text)
//   import "@engine/..."                -> runtime/...
//   import "@lib/<type>/<name>@<ver>"   -> the approved library version (library/lib.mjs resolves + verifies it)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { P, esbuild } from "./env.mjs";
import { vendorReady, fetchVendor } from "./vendor.mjs";

const TS_EXT = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];
function withExt(p) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  for (const e of TS_EXT) if (fs.existsSync(p + e)) return p + e;
  return p;
}

export function filmDir(id) {
  const d = path.join(P.videos, id);
  if (!fs.existsSync(path.join(d, "film.ts"))) throw new Error(`no film at videos/${id}/film.ts`);
  return d;
}

function enginePlugin(libResolve) {
  return {
    name: "engine-paths",
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(P.vendor, "three/build/three.module.js") }));
      b.onResolve({ filter: /^three\/(addons|examples\/jsm)\// }, (a) => ({
        path: withExt(path.join(P.vendor, "three/examples/jsm", a.path.replace(/^three\/(addons|examples\/jsm)\//, ""))),
      }));
      b.onResolve({ filter: /^postprocessing$/ }, () => ({ path: path.join(P.vendor, "postprocessing/src/index.js") }));
      b.onResolve({ filter: /^@engine\// }, (a) => ({ path: withExt(path.join(P.runtime, a.path.slice(8))) }));
      b.onResolve({ filter: /^@lib\// }, (a) => ({ path: libResolve(a.path.slice(5), a.importer) }));
    },
  };
}

export async function bundleFilm(id, { log = console.log } = {}) {
  if (!vendorReady()) fetchVendor({ log });
  const dir = filmDir(id);
  const outDir = path.join(P.build, id);
  fs.mkdirSync(outDir, { recursive: true });
  const { resolveLibImport } = await import("../library/lib.mjs");
  const used = new Set();
  const libResolve = (spec, importer) => { const r = resolveLibImport(spec, importer); used.add(r.id); return r.file; };
  const eb = await esbuild();
  const entry = `import film from ${JSON.stringify(path.join(dir, "film.ts"))};\nimport { boot } from "@engine/film";\nboot(film);\n`;
  const r = await eb.build({
    stdin: { contents: entry, resolveDir: dir, loader: "ts", sourcefile: `${id}-entry.ts` },
    bundle: true, format: "esm", target: "es2022", write: false, sourcemap: "inline", metafile: true,
    outfile: path.join(outDir, "bundle.js"), logLevel: "silent",
    loader: { ".frag": "text", ".vert": "text", ".glsl": "text", ".txt": "text" },
    plugins: [enginePlugin(libResolve)],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  for (const w of r.warnings) log("esbuild warning: " + w.text);
  const js = r.outputFiles[0].contents;
  fs.writeFileSync(path.join(outDir, "bundle.js"), js);
  fs.writeFileSync(path.join(outDir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style></head>` +
    `<body><script type="module" src="bundle.js"></script></body></html>\n`);
  // static files a film may load at runtime (fonts, GLBs, textures): videos/<id>/public and approved library files
  // are served directly by the render server, so nothing is copied here.
  const hash = crypto.createHash("sha256").update(js).digest("hex");
  return { id, dir, outDir, hash, libUsed: [...used].sort(), inputs: Object.keys(r.metafile.inputs) };
}
