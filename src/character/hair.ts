import type { LayerDef } from './layers';

export const HAIR_STYLES = ['bald', 'short', 'long', 'mohawk', 'topknot', 'braid', 'messy'] as const;
export const BEARD_STYLES = ['none', 'stubble', 'short', 'full', 'long', 'braided'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export type BeardStyle = (typeof BEARD_STYLES)[number];

export const HAIR_COLORS = ['#1a1410', '#4a2f1c', '#8a5a2b', '#c9a24a', '#b8b8b0', '#e8e4d8', '#7a2a1a', '#2a4a6a', '#3a6a3a', '#6a3a7a'];

const mat = (color: string) => ({ color, metalness: 0, roughness: 0.85 });

function hair(id: string, color: string, order: number, cover: LayerDef['cover'], extra: Partial<LayerDef> = {}): LayerDef {
  return {
    id, name: id, kind: 'cloth', slot: 'head', order, cover,
    offset: 0.01, thickness: 0.004, rimSharpness: 1, rigidity: 0.1, conform: 0.3, hidesBody: false,
    surfaceNoise: 0.0025, material: mat(color), ...extra,
  };
}

/** Build hair + beard layers (cover rules on the head/neck cage). Equip as extra layers. */
export function hairLayers(style: string, color: string, seed = 1, beard = 'none', beardColor = color): LayerDef[] {
  const out: LayerDef[] = [];
  const hs = seed * 31 + 7;
  switch (style) {
    case 'short':
      out.push(hair('hair', color, 5, [{ parts: ['head'], from: 0.66 }, { parts: ['head'], from: 0.5, facing: 'back' }]));
      break;
    case 'messy':
      out.push(hair('hair', color, 5, [{ parts: ['head'], from: 0.64 }, { parts: ['head'], from: 0.42, facing: 'back', flare: [0.012, 0.02] }],
        { offset: 0.016, surfaceNoise: 0.006, holes: { density: 0.18, seed: hs } }));
      break;
    case 'long':
      out.push(hair('hair', color, 5, [
        { parts: ['head'], from: 0.64 },
        { parts: ['head'], from: 0.1, facing: 'back', flare: [0.03, 0.012] },
        { parts: ['neck'], facing: 'back', flare: [0.04, 0.03] },
      ], { offset: 0.014, thickness: 0.006, surfaceNoise: 0.004 }));
      break;
    case 'mohawk':
      out.push(hair('hair', color, 5, [{ parts: ['head'], from: 0.8, flare: [0.01, 0.06] }, { parts: ['head'], from: 0.55, facing: 'back', flare: [0, 0.03] }],
        { offset: 0.02, surfaceNoise: 0.008, holes: { density: 0.3, seed: hs } }));
      break;
    case 'topknot':
      out.push(hair('hair', color, 5, [{ parts: ['head'], from: 0.7 }]));
      out.push(hair('knot', color, 6, [{ parts: ['head'], from: 0.9, flare: [0.02, 0.05] }], { offset: 0.03, thickness: 0.01, surfaceNoise: 0.002 }));
      break;
    case 'braid':
      out.push(hair('hair', color, 5, [{ parts: ['head'], from: 0.66 }, { parts: ['head'], from: 0.35, facing: 'back' }]));
      out.push(hair('braid', color, 6, [{ parts: ['neck'], facing: 'back', flare: [0.03, 0.02] }, { parts: ['head'], from: 0.1, to: 0.4, facing: 'back', flare: [0.03, 0.04] }],
        { offset: 0.03, thickness: 0.01, surfaceNoise: 0.007 }));
      break;
    default:
      break;
  }
  const b = (cover: LayerDef['cover'], extra: Partial<LayerDef> = {}) =>
    out.push(hair('beard', beardColor, 7, cover, { offset: 0.008, ...extra }));
  switch (beard) {
    case 'stubble':
      b([{ parts: ['head'], to: 0.38, facing: 'front' }], { offset: 0.002, thickness: 0.001, surfaceNoise: 0.0012, material: mat(beardColor) });
      break;
    case 'short':
      b([{ parts: ['head'], to: 0.4, facing: 'front' }], { surfaceNoise: 0.002 });
      break;
    case 'full':
      b([{ parts: ['head'], to: 0.42, facing: 'front' }, { parts: ['head'], to: 0.3, side: 'L' }, { parts: ['head'], to: 0.3, side: 'R' }, { parts: ['neck'], to: 0.4, facing: 'front' }],
        { offset: 0.014, surfaceNoise: 0.004 });
      break;
    case 'long':
      b([{ parts: ['head'], to: 0.42, facing: 'front', flare: [0.05, 0.01] }, { parts: ['neck'], facing: 'front', flare: [0.04, 0.03] }],
        { offset: 0.016, thickness: 0.008, surfaceNoise: 0.005, holes: { density: 0.08, seed: hs + 1 } });
      break;
    case 'braided':
      b([{ parts: ['head'], to: 0.3, facing: 'front', flare: [0.07, 0.01] }, { parts: ['neck'], facing: 'front', flare: [0.06, 0.04] }],
        { offset: 0.018, thickness: 0.01, surfaceNoise: 0.007 });
      break;
    default:
      break;
  }
  return out;
}
