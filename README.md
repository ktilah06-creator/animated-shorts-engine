# animated-shorts-engine

Reusable engine for hybrid 2D/3D animated vertical shorts. A film is a TypeScript module that builds a three.js
world and poses it per frame; the engine renders it deterministically in headless Chrome and encodes it with ffmpeg.

Status: engine, visual components, characters, overlays, sound; first film in production (videos/tambora-1816).

## Requirements
- Node 20+, ffmpeg/ffprobe, Python 3 with numpy + Pillow (QA), git.
- Chrome or Chromium. In the cloud workspace these are preinstalled; on a PC run `npm install` once (esbuild + Playwright).
- GPU optional: without one Chrome renders with SwiftShader (CPU WebGL2). Force with `ENGINE_GL=gpu|swiftshader`.

## Commands
```
node engine/cli.mjs vendor                          # fetch pinned three.js r187 + postprocessing v6.39.6 into vendor/
node engine/cli.mjs build   <film>                  # bundle only (import / syntax check)
node engine/cli.mjs stills  <film> 10,45,90         # full-size JPEG stills -> out/<film>/stills/
node engine/cli.mjs render  <film> --preview        # half size, no MSAA -> out/<film>/<film>_preview_video.mp4
node engine/cli.mjs render  <film> --audio mix.wav  # final 1080x1920 30 fps H.264 (+ AAC 48 kHz)
node engine/cli.mjs render  <film> --only s3,s4     # force these shots; unchanged shots come from cache/
node engine/cli.mjs cues    <film> <audio> [script.txt]  # optional timing cues (sentences, words) from the voice-over
node engine/cli.mjs sound   <film>                  # score + SFX (videos/<film>/sound.py) + final mix -> out/<film>/mix.wav
node engine/cli.mjs qa      out/<film>/<file>.mp4 --film <film>   # frame-by-frame QA + contact sheets
node engine/cli.mjs selftest                        # engine checks (determinism, cache, concat, audio, library)
node tools/asset.mjs search lantern                 # asset library (see library/README.md)
```

## How a film is written
```ts
import * as THREE from "three";
import { defineFilm } from "@engine/film";
import { LightRig } from "@engine/look/rig";
import { twoTone } from "@engine/look/shade";
import { camPath, applyCam } from "@engine/camera";
import { lantern } from "@lib/prop/lantern@1";   // approved library asset, version pinned

export default defineFilm({
  id: "my-film",
  shots: [{ id: "hook", a: 0, b: 90, light: "day" }, { id: "reveal", a: 90, b: 180, xfade: 8, light: "golden" }],
  setup(ctx) {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene);
    // ... build the world from library assets and components ...
    const cam = camPath([{ f: 0, pose: { pos: [0, 2, 9], look: [0, 1, 0] }, creep: 0.25 }]);
    return {
      scene,
      frame(f, shot, c) {               // pure function of f: no clocks, no Math.random (use rng(seed))
        applyCam(c, cam(f));
        rig.apply(shot.light as string, c);
        return { grade: shot.light as string, cInf: 10, focus: new THREE.Vector3(0, 1, 0) };
      },
    };
  },
});
```
Timing cues are optional input: films can place events at fixed frames, or read a cue file when one is supplied.

## Render chain
scene → ink (world outlines; character cards opt out via the `NOINK` layer) → depth of field (half-resolution
gather, switched off on frames without blur) → bloom (emissive only) → neutral tone map → colour grade. Every
pixel-sized parameter is defined at 1080x1920 and scales with the render height, so previews match finals.

Each shot is encoded to its own file in `cache/<film>/`, keyed by the bundle, the shot, the settings and the exact
library versions used; files are joined with the concat demuxer (no re-encode) and the audio is muxed last.

Measured in the cloud workspace (2 CPU cores, SwiftShader), simple test scenes: final 1080x1920 ≈ 2.4 s/frame
without DOF, ≈ 3.4 s/frame with DOF; preview (540x960, no MSAA) ≈ 0.5-1.0 s/frame. A desktop GPU is far faster.

## Layout
```
engine/    Node side: env, vendor pins, bundler, renderer, CLI, selftest
runtime/   browser side
  film.ts       core: renderer, post chain, shots, crossfades, flashes, overlay DOM, rng
  camera.ts     camPath (keys, glides, creep, kicks, roll), orbit, dolly
  post/         ink (world outlines), dof (half-res depth of field), lensblur (full-res), grade
  look/         rig (sky, sun, fog, shadow fit, presets), lights (presets), shade (two-tone), materials
                (cached two-tone materials, GLB conversion + recolour), paint (procedural textures),
                water, clouds
  env/          geo (quad/tri/boxGeo, Batch merging), strand (ropes, rails, chains), sight (sight-line
                culling), vegetation, house (gabled house generator), banner, kit (GLB kits from the library)
library/   approved assets (immutable versions), manifest, licenses, credits
tools/     asset.mjs (library CLI)
audio/     dsp, instruments, sfx_gen (ported, MIT), fx.py (engine SFX), mixer.py (voice + ducked music + SFX ->
           -14 LUFS, true peak <= -1 dBTP, exact length)
qa/        short_qa.py (frame-by-frame QA), sbs_sheet.py (side-by-side sheets)
videos/    one folder per film (videos/_selftest and videos/_looktest are engine tests)
```

Third-party code and licenses: see THIRD_PARTY.md.
