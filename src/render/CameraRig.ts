import type { PerspectiveCamera } from 'three';
import { Track, type Key } from '../core/math';
import { S } from '../core/timeline';

/**
 * CAMERA CHOREOGRAPHY
 * Keys are authored for a 16:9 frame in film seconds: [pos xyz, target xyz, fov].
 * Interpolated with a C1-continuous spline so moves flow into each other
 * (dolly → tilt → push-in → orbit → pull-out). Narrower viewports (portrait
 * phones, split-screen halves) automatically dolly back to keep the framing.
 */

const k = (t: number, p: [number, number, number], q: [number, number, number], fov = 32, hold = false): Key => ({
  t,
  v: [...p, ...q, fov],
  hold,
});

// Main path (also the path after the split, shared by both cameras)
const MAIN_AFTER_SPLIT: Key[] = [
  k(S(4, 2.2), [8.2, 5.6, 9.6], [0, 1.25, 0], 32),
  k(S(4, 6), [4.6, 4.5, 7.0], [0.1, 1.15, 0.1], 33),
  k(S(4, 10), [-1.2, 4.9, 7.6], [0, 1.0, 0], 33),
  k(S(4, 14.5), [-5.4, 4.9, 6.8], [-0.4, 1.0, 0], 33),
  k(S(5, 2.5), [-3.4, 3.7, 8.2], [-1.6, 1.05, 0.4], 33),
  k(S(5, 6.5), [1.2, 4.8, 11.0], [-1.8, 0.9, 0.6], 32),
  k(S(5, 9.5), [9.5, 9.0, 18.5], [0, 0.4, 0], 31),
  k(S(5, 13.5), [19.5, 14.5, 26.5], [0, -0.6, 0], 30),
  k(S(5, 16), [21, 15.6, 28.5], [0, -0.7, 0], 30, true),
];

const PATH_A: Key[] = [
  k(S(0, 0), [17, 12.5, 21], [0, 0.2, 0], 30, true),
  k(S(0, 4.5), [12.2, 8.4, 15.2], [-0.2, 0.6, -0.1], 31),
  k(S(0, 9), [7.4, 4.8, 9.2], [-0.4, 1.05, -0.7], 32),
  k(S(0, 12.5), [5.0, 3.4, 6.9], [-0.3, 1.3, -1.0], 33),
  // the spark: tilt up to the sky, follow it down, push in on the core
  k(S(1, 2.6), [4.4, 1.9, 7.6], [0, 6.4, -0.4], 36),
  k(S(1, 4.6), [4.3, 2.2, 7.3], [0, 4.0, 0], 36),
  k(S(1, 6.4), [3.9, 2.4, 6.5], [0, 2.1, 0.15], 35),
  k(S(1, 8.2), [3.4, 2.5, 5.7], [0, 1.75, 0.15], 34),
  k(S(1, 10.5), [2.9, 2.3, 5.0], [0, 1.75, 0.15], 34),
  // training: slow orbit around the core
  k(S(2, 3), [-2.4, 3.0, 6.1], [0, 1.45, 0], 34),
  k(S(2, 7), [-6.1, 4.0, 3.6], [0, 1.35, -0.2], 34),
  k(S(2, 11), [-6.2, 5.6, 6.9], [0, 1.45, 0], 33),
  k(S(2, 13.6), [-2.5, 7.6, 12.0], [0, 1.5, 0], 32),
  // security: exterior (view A = local AI)
  k(S(3, 3), [5.0, 8.8, 19.0], [0, 1.6, 0], 32),
  k(S(3, 12.5), [8.4, 7.8, 17.6], [0, 1.8, 0], 32),
  ...MAIN_AFTER_SPLIT,
];

// View B (cloud agents) during the split, then the shared main path
const PATH_B: Key[] = [
  k(S(3, 2), [15.5, 6.6, 13.5], [4.2, 6.2, -4.2], 36),
  k(S(3, 12.5), [14.6, 8.2, 15.4], [4.0, 5.4, -4.0], 35),
  ...MAIN_AFTER_SPLIT,
];

/** Tilt-shift focus over time: [focus y, band, max blur px]. */
const FOCUS: Key[] = [
  { t: S(0, 0), v: [0.47, 0.12, 8] },
  { t: S(0, 12), v: [0.44, 0.13, 8] },
  { t: S(1, 5), v: [0.55, 0.18, 6] },
  { t: S(2, 6), v: [0.5, 0.2, 6] },
  { t: S(3, 3), v: [0.5, 0.28, 4.5] },
  { t: S(4, 4), v: [0.47, 0.16, 7] },
  { t: S(5, 6), v: [0.46, 0.15, 7] },
  { t: S(5, 16), v: [0.5, 0.22, 6] },
];

/** Lens shift (fraction of frame) — moves the island aside for the final screen. */
const SHIFT: Key[] = [
  { t: S(5, 9), v: [0] },
  { t: S(5, 13), v: [1] },
];

export class CameraRig {
  private a = new Track(PATH_A, 'spline');
  private b = new Track(PATH_B, 'spline');
  private focus = new Track(FOCUS, 'smooth');
  private shift = new Track(SHIFT, 'smooth');
  private va = new Array(7).fill(0);
  private vb = new Array(7).fill(0);
  private vf = [0, 0, 0];
  private vs = [0];
  reducedMotion = false;

  /**
   * @param aspectA aspect ratio of view A (full frame or split half)
   * @param fullW,fullH css size of the full frame (for lens shift)
   */
  apply(t: number, time: number, camA: PerspectiveCamera, camB: PerspectiveCamera, aspectA: number, aspectB: number, portrait: boolean) {
    this.place(this.a.eval(t, this.va), camA, aspectA, time, portrait, t);
    this.place(this.b.eval(t, this.vb), camB, aspectB, time + 7.3, portrait, t);
  }

  focusAt(t: number) {
    return this.focus.eval(t, this.vf);
  }

  private place(v: number[], cam: PerspectiveCamera, aspect: number, time: number, portrait: boolean, t: number) {
    // dolly back for narrow frames so the subject stays in view
    const ref = 16 / 9;
    const f = Math.pow(Math.min(3.2, Math.max(1, ref / aspect)), 0.82);
    const tx = v[3];
    const ty = v[4];
    const tz = v[5];
    let px = tx + (v[0] - tx) * f;
    let py = ty + (v[1] - ty) * f;
    let pz = tz + (v[2] - tz) * f;
    // gentle handheld breathing (disabled for reduced motion)
    if (!this.reducedMotion) {
      const dist = Math.hypot(px - tx, py - ty, pz - tz);
      const a = 0.006 * dist;
      px += Math.sin(time * 0.31) * a + Math.sin(time * 0.71 + 2) * a * 0.4;
      py += Math.sin(time * 0.23 + 1) * a * 0.7;
      pz += Math.cos(time * 0.27 + 0.5) * a;
    }
    cam.position.set(px, py, pz);
    cam.lookAt(tx, ty, tz);
    cam.fov = v[6] + (f - 1) * 4;
    cam.aspect = aspect;
    // lens shift for the final screen (island to the right / bottom)
    const s = this.shift.eval(t, this.vs)[0];
    if (s > 0.0001) {
      const W = 1000 * aspect;
      const H = 1000;
      if (portrait) cam.setViewOffset(W, H, 0, H * 0.04 * s, W, H);
      else cam.setViewOffset(W, H, -W * 0.04 * s, H * 0.03 * s, W, H);
    } else if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
}
