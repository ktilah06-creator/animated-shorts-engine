# Asset library

Persistent, versioned store of approved assets: characters and expression sets, models, environments and modules,
props, materials, textures, HDRIs, lighting and camera presets, animation patterns, scene components, fonts, audio.

## Rules
1. **Reuse first.** `node tools/asset.mjs search <words> [--type <type>]` searches approved assets and staging.
2. **Then free sources.** Check the license on the asset's own page (sites mix licenses). Accepted: CC0-1.0,
   CC-BY-3.0/4.0 (credit line required), MIT, Apache-2.0, BSD-3-Clause, Zlib, OFL-1.1, Public-Domain, Original. Never NC or ND.
3. **Create only when nothing fits**, and record it as `--kind original` (hand-written / procedural code) or
   `--kind generated --tool <what made it>`.
4. **Approved versions never change.** Every file's sha256 is in `manifest.json`; builds, the render server and
   `asset validate` refuse modified files. A change is always a new version (`v002`), recorded in `asset_change_log.md`.
5. **Films pin versions**: `import { x } from "@lib/prop/lantern@1"` or `ctx.lib("prop/lantern", 1, "lantern.glb")`.
   Each render writes `videos/<film>/assets.lock.json` and adds the film to the version's `usedBy`.

## Workflow
```
node tools/asset.mjs stage prop/lantern lantern.glb --kind external --creator "Kenney" \
  --url https://kenney.nl/assets/... --license CC0-1.0 --license-url https://kenney.nl/assets/... \
  --modifications "recoloured roof" --tags light,street,victorian --description "street lantern" --entry lantern.glb
# save the license page / license text into library/staging/prop/lantern/_license/
node tools/asset.mjs promote prop/lantern --note "first approved version"
node tools/asset.mjs validate
```

## Layout
```
manifest.json                 records: source, creator, URL, license (+ evidence), dates, modifications, files + sha256, usedBy
assets/<type>/<name>/v001/    approved files (immutable)
licenses/<type>/<name>/v001/  license evidence per version
staging/<type>/<name>/        under review: asset.json (draft record), files, _license/  (never imported by films)
attribution_credits.md        generated credit list
asset_change_log.md           append-only approval log
```
Types: character, expression-set, model, environment, env-module, prop, material, texture, hdri, lighting-preset,
camera-preset, animation-pattern, scene-component, font, audio, effect.
