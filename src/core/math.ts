/**
 * Small, allocation-free math helpers used by the timeline and every scene.
 * All story animation is expressed as pure functions of film time `t` (seconds),
 * so scrubbing backwards/forwards always yields the same picture.
 */

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0→1 as t goes from a to b (clamped). */
export const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
/** Rises a→b, holds, falls c→d (all smoothed). */
export const window4 = (t: number, a: number, b: number, c: number, d: number) =>
  smooth(ramp(t, a, b)) * (1 - smooth(ramp(t, c, d)));

export const ease = {
  inCubic: (x: number) => x * x * x,
  outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x: number) => 1 - Math.pow(1 - x, 4),
  inOutSine: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
  outExpo: (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  outElastic: (x: number) => {
    if (x === 0 || x === 1) return x;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

/** Frame-rate independent exponential smoothing. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Deterministic pseudo random in [0,1) from an integer/float seed. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

/** Mulberry32 seeded RNG for procedural geometry (stable between reloads). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Multi-channel keyframe track.
 *  - mode 'spline': non-uniform Catmull–Rom (C1 continuous) — used for camera moves,
 *    so the camera never "stops" at a keyframe unless the key says `hold`.
 *  - mode 'smooth': smoothstep between neighbouring keys — used for grading/lighting.
 */
export interface Key {
  t: number;
  v: number[];
  /** Zero velocity at this key (a deliberate settle). */
  hold?: boolean;
}

export class Track {
  readonly keys: Key[];
  readonly dims: number;
  private tangents: number[][];
  constructor(keys: Key[], readonly mode: 'spline' | 'smooth' = 'spline') {
    this.keys = [...keys].sort((a, b) => a.t - b.t);
    this.dims = this.keys[0].v.length;
    this.tangents = this.keys.map((k, i) => {
      const out = new Array(this.dims).fill(0);
      if (k.hold || i === 0 || i === this.keys.length - 1) return out;
      const p = this.keys[i - 1];
      const n = this.keys[i + 1];
      for (let d = 0; d < this.dims; d++) out[d] = (n.v[d] - p.v[d]) / (n.t - p.t);
      return out;
    });
  }

  /** Evaluate into `out` (no allocation). */
  eval(t: number, out: number[]): number[] {
    const k = this.keys;
    if (t <= k[0].t) return copy(k[0].v, out);
    const last = k.length - 1;
    if (t >= k[last].t) return copy(k[last].v, out);
    let i = 0;
    while (i < last && k[i + 1].t < t) i++;
    const a = k[i];
    const b = k[i + 1];
    const h = b.t - a.t;
    const s = (t - a.t) / h;
    if (this.mode === 'smooth') {
      const w = smooth(s);
      for (let d = 0; d < this.dims; d++) out[d] = a.v[d] + (b.v[d] - a.v[d]) * w;
      return out;
    }
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const ma = this.tangents[i];
    const mb = this.tangents[i + 1];
    for (let d = 0; d < this.dims; d++) {
      out[d] = h00 * a.v[d] + h10 * h * ma[d] + h01 * b.v[d] + h11 * h * mb[d];
    }
    return out;
  }
}

function copy(src: number[], out: number[]) {
  for (let i = 0; i < src.length; i++) out[i] = src[i];
  return out;
}

/** Hex string → linear-ish rgb triple 0..1 (sRGB values; THREE.Color converts). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
