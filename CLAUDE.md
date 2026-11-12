# Working rules for this repository

This repo is the animation engine of the user's educational shorts channel. Claude's role here is limited to
coding, building, rendering and technically checking the animated videos. Topic research, scripts, voice-over,
SEO and publishing are handled by the user elsewhere: do not take them on.

## Before changing anything
- Run `node engine/cli.mjs selftest`; it must pass before and after engine changes.
- Read README.md (commands, film API) and library/README.md (asset rules).

## Asset library (non-negotiable)
- Search first: `node tools/asset.mjs search <words>`. Then free sources with a verified per-asset license
  (Poly Haven, Kenney, ambientCG, Quaternius, ... check the asset's own page). Create new assets only when nothing fits.
- Approved versions are immutable. Never edit files under `library/assets/`. A change is a new version via
  `stage` + `promote`. Never delete approved assets without the user's explicit permission.
- Every version needs source, creator, license (CC0 / CC-BY / MIT / OFL / Apache / Zlib / Original; never NC or ND),
  license evidence for external assets, and modifications. `asset validate` checks all of it.
- Films import pinned versions only: `@lib/<type>/<name>@<version>`.

## Films
- Frames are pure functions of the frame number: no `Date`, no `Math.random` (use `rng(seed)` from `@engine/film`).
- Pixel-sized parameters are specified at 1080x1920 and scaled with `ctx.pxScale`.
- Timing cues from the user's voice-over are optional input, never a requirement.
- Do not copy the story, characters, military imagery or distinctive shots of the reference repository
  (mromidev/claude-animated-shorts); its code is reused under MIT only (see THIRD_PARTY.md).

## Rendering in the cloud workspace
- 2 CPU cores, no GPU (SwiftShader): look at stills first, then a `--preview` render, then the final.
- One command may run at most 10 minutes: render long films shot by shot (`--only`) or in the background.
- Network: GitHub via git works; npm/pip registries and most asset sites are blocked from the shell.

## Git
- Work on a branch per milestone, push it, then merge it into `main` yourself (the user asked for this).
- The session cannot delete remote branches; leave merged branches in place.
