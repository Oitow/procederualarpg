# CLAUDE.md – project memory

## Vision
Idle / auto-battler ARPG in the spirit of Diablo 2 / Path of Exile ("with everything": loot, skills,
classes, gear). Built step by step. **Done so far: procedural character system, procedural isometric world prototype.**
The owner writes in German (sometimes English); answer in the language they use.

## Repo layout & workflow
- **Game** (main product): `index.html` + `src/game/` – isometric, procedural world "Gloomvale". Dark, gritty palette
  (deep greens, dark blues, warm torch accents). *Everything* is procedural: world, character, monsters, items.
- **Lab** (test bench): `lab/index.html` + `src/viewer/` – Character Forge; new systems are tried here first.
- Branches: work happens on the `claude/...` branch; it goes to `main` only after the owner approves.
- Owner tests on the phone (portrait + touch) and gives feedback. Keep self-testing short (max ~3 checks), be token-efficient.

## Stack & commands
TypeScript + three.js (0.186), lil-gui, Vite 8, Vitest 5, TypeScript 7.
- `npm run dev` – game at http://localhost:5173, lab at http://localhost:5173/lab/
- `npm test` – 22 tests (topology, rig, layers, performance budget). Keep them green.
- `npm run typecheck`, `npm run build`
- `npm run build:artifact` – viewer as one HTML page in `dist-artifact/` (three + lil-gui via jsDelivr import map)

Live pages (claude.ai artifacts, owned by the user; `npm run build:artifact` builds both into `dist-artifact/`):
- Lab / Character Forge: https://claude.ai/artifact/E4KCVQrRGRqzfnSzx54fCK
- Game / Gloomvale: https://claude.ai/artifact/MwDK3KVdfsSW4w5RfpYc38
To update from a new session: build, read the artifact first, then publish `dist-artifact/gloomvale.html`
or `character-forge.html` with that `url`, so the link stays the same.

## Game map (`src/game/`)
- `world.ts` – terrain height/moisture noise, 24 m chunks streamed around the player, instanced props
  (pines, dead trees, rocks, grass, ruin pillars), water plane, `PALETTE`, procedural region names
- `main.ts` – isometric orthographic camera (follows player), tap/click-to-move with hold-to-steer, pinch/wheel zoom,
  WASD, moonlight + flickering torch, player = `buildCharacter` (Rogue outfit, subdivision 1)

## Character system map (`src/character/`)
Pipeline: `params → rig → cage → layers → subdivision → detail → geometry → SkinnedMesh`
- `params.ts` – parameters, ranges, presets (Human, Heroic, Brute, Elf, Dwarf, Goblin), seeded variation
- `rig.ts` – 22 bones, rest frames, joint limits, three.js skeleton, clamped `setPose`
- `anatomy.ts` – **artist data only**: limb cross-section stations, torso layers, sculpt deformers
- `cage.ts` – low-poly quad cage: 4×6×2 torso box, limbs extruded from 2×2 patches, one ring per station
- `subdivision.ts` – Catmull-Clark (n-gons, boundaries, integer creases, interpolates all channels) + `fitCageToLimit`
- `layers.ts` – clothing/armour shells from cage faces (`LAYER_LIBRARY`, `OUTFITS`)
- `detail.ts` – sculpt field (muscles/fat/face) + fbm noise along normals
- `generator.ts` – `generateCharacterData` (engine-agnostic arrays) and `buildCharacter` (three.js)
- `animation.ts` – procedural clips: bind, idle, walk, attack, flexTest
- `src/viewer/main.ts` – viewer; `window.forge` hook for automated screenshots

## Conventions
- Y up, character faces **+Z**, character's **left = +X**. Meters; reference figure is 1.8 m (`rig.scale`).
- Bone frame: local Y along the bone, local Z = flex direction (forward; up for feet), X = Y×Z.
  Rotation X = flex, Y = twist, Z = side bend. Limits are authored for L and mirrored for R
  (R: negate y/z ranges, swap rx radii, negate sculpt x).
- Cage vertex data = xyz + one weight per bone (stride 3 + 22). Subdivision keeps vertex-point indices
  (vertex v of the cage is still v after subdividing).
- Shape tweaks belong in `anatomy.ts` (data), behaviour in code.

## Lessons learned (don't regress)
- Subdivide the **closed** body first, then drop hidden faces (`HIDDEN_FLAG` in faceTags). Removing faces
  before subdividing makes hole borders poke through clothing.
- Catmull-Clark shrinks the shape → `fitCageToLimit` (3 iterations, strength 0.85) restores authored radii.
- Rings closer than ~2.6 cm (scaled) are skipped, otherwise the fit makes bulges (short necks).
- Head ring resolution doubles at `NECK_CHAIN.refineAt` via 8 pentagons + 4×4 grid cap (tests expect 8 pentagons).
- Metal needs `scene.environment` (RoomEnvironment), otherwise it renders black.
- Visual checks: Playwright + Chromium with `--use-gl=angle --use-angle=swiftshader`. In this sandbox the
  headless browser can't reach the CDN, so map the import map to local `node_modules` copies when testing the artifact build.

## Performance budget
Knight outfit (11 layers): ~14k tris / ~25 ms at subdivision 1; ~56k tris / ~75–105 ms at level 2.
Subdivision level = LOD. One draw call per layer, shared skeleton.

## Roadmap ideas (not started)
- Game core: idle/auto-battle loop, stats & damage, enemies, loot and item affixes, skill trees
- Character: UVs/triplanar textures, normal maps, dual-quaternion skinning, fingers/thumb, capes/robes,
  geometry cache + Web Worker generation for enemy waves
