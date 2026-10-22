// Builds the viewer as ONE self-contained HTML page (three.js + lil-gui from
// jsDelivr via an import map, app code inlined). Output: dist-artifact/character-forge.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'vite';

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1';
const LILGUI = 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js';

await build({
  configFile: false,
  mode: 'artifact',
  logLevel: 'warn',
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    minify: true,
    lib: { entry: 'src/viewer/main.ts', formats: ['es'], fileName: () => 'forge.js' },
    rolldownOptions: { external: [/^three/, 'lil-gui'] },
  },
});

const js = readFileSync('dist-artifact/forge.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const importMap = {
  imports: {
    three: `${THREE}/build/three.module.js`,
    'three/examples/jsm/': `${THREE}/examples/jsm/`,
    'lil-gui': LILGUI,
  },
};

const html = `<title>Character Forge</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  :root {
    /* Layout: full-bleed WebGL stage, overlays pinned to the safe-area corners */
    --stage: #1b1e24;
    --ink: #e8e6e3;
    --ink-dim: #a9a49b;
    --panel: rgba(12, 14, 18, 0.74);
    --brass: #d8b26a;
    color-scheme: dark;
  }
  html, body { height: 100%; }
  body { margin: 0; background: var(--stage); color: var(--ink); overflow: hidden; font: 13px/1.4 system-ui, sans-serif; }
  #app { position: fixed; inset: 0; }
  #app canvas { display: block; touch-action: none; }
  #title {
    position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: max(16px, env(safe-area-inset-left, 0px));
    pointer-events: none; display: flex; flex-direction: column; gap: 2px; max-width: calc(100vw - 32px);
  }
  #title b { font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; font-size: 13px; color: var(--brass); }
  #title span { font-size: 12px; color: var(--ink-dim); }
  #stats {
    position: fixed; left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    padding: 8px 10px; background: var(--panel); color: var(--ink); border-radius: 6px;
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; pointer-events: none;
    font-variant-numeric: tabular-nums; max-width: calc(100vw - 32px); overflow: hidden;
  }
  .lil-gui.autoPlace {
    top: env(safe-area-inset-top, 0px) !important; right: env(safe-area-inset-right, 0px) !important;
    max-height: calc(100% - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
  }
  @media (max-width: 700px) {
    #stats { font-size: 10px; }
    #title { top: calc(44px + env(safe-area-inset-top, 0px)); }
    .lil-gui.autoPlace { --width: min(300px, 82vw); }
  }
</style>
<div id="app"></div>
<div id="title"><b>Character Forge</b><span>Ziehen zum Drehen · Panel oben rechts</span></div>
<div id="stats"></div>
<script type="importmap">${JSON.stringify(importMap)}</script>
<script type="module">${js}</script>
`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/character-forge.html', html);
console.log(`dist-artifact/character-forge.html (${(html.length / 1024).toFixed(0)} KB)`);
