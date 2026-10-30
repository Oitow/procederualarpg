# CLAUDE.md – project memory

## Vision
Idle / auto-battler ARPG in the spirit of Diablo 2 / Path of Exile ("with everything": loot, skills,
classes, gear). Built step by step. **Done so far: procedural character model system.**
The owner writes in German (sometimes English); answer in the language they use.

## Stack & commands
TypeScript + three.js (0.186), lil-gui, Vite 8, Vitest 5, TypeScript 7.
- `npm run dev` – viewer "Character Forge" (http://localhost:5173)
- `npm test` – 22 tests (topology, rig, layers, performance budget). Keep them green.
- `npm run typecheck`, `npm run build`
- `npm run build:artifact` – viewer as one HTML page in `dist-artifact/` (three + lil-gui via jsDelivr import map)

Live viewer (claude.ai artifact, owned by the user): https://claude.ai/artifact/E4KCVQrRGRqzfnSzx54fCK
To update it from a new session: `npm run build:artifact`, read the artifact first, then publish
`dist-artifact/character-forge.html` with that `url`, so the link stays the same.

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
