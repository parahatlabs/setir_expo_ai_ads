import type { WorldState } from './state';
import { S, addCue } from '../core/timeline';
import { clamp, ease, ramp, smooth, window4 } from '../core/math';
import { CORE_POS } from '../world/layout';

/**
 * SCENE 2 — THE SPARK. The office darkens, a point of light descends from the
 * night sky, lands in the middle of the office and blooms into the AI Core.
 */
const T0 = S(1);
export const SPARK_START = T0 + 2.2;
export const LAND = T0 + 6.6;
addCue(SPARK_START + 0.2, 'whoosh');
addCue(LAND, 'land');

export function apply(t: number, s: WorldState) {
  const dark = smooth(ramp(t, T0 + 0.2, T0 + 2.4));
  for (let i = 0; i < s.lamp.length; i++) s.lamp[i] = 1 - 0.88 * dark;
  for (let i = 0; i < 6; i++) {
    s.screenPower[i] = 1 - 0.35 * dark;
    const p = s.poses[i];
    p.type *= 1 - dark;
    p.hunch *= 1 - 0.7 * smooth(ramp(t, SPARK_START, LAND));
    p.look = smooth(ramp(t, SPARK_START + 1.2 + i * 0.12, LAND + 0.8));
  }
  s.clockSpeed *= 1 - 0.6 * dark;

  if (t < SPARK_START) return;
  const c = s.core;
  c.appear = 1;
  // descent: slow ease-in from the sky, a gentle spiral, soft landing
  const r = ramp(t, SPARK_START, LAND);
  const d = 1 - Math.pow(1 - r, 2.2); // quick entrance, soft landing
  const sp = (1 - d) * 1.2;
  c.pos.set(
    CORE_POS.x + Math.sin(d * 6.0) * sp,
    CORE_POS.y + (1 - d) * 9.5,
    CORE_POS.z + Math.cos(d * 6.0) * sp * 0.6,
  );
  const grow = ease.outElastic(clamp((t - LAND) / 1.6));
  c.scale = t < LAND ? 0.11 : 0.11 + 0.89 * grow;
  c.trail = window4(t, SPARK_START, SPARK_START + 0.6, LAND - 0.7, LAND);
  c.energy = t < LAND ? 2.2 : 1.05;
  c.halo = window4(t, LAND - 0.05, LAND + 0.08, LAND + 0.2, LAND + 1.6) * 1.4;
  c.shock = t < LAND ? 0 : clamp((t - LAND) / 2.0);
  c.rings = smooth(ramp(t, LAND + 0.6, LAND + 3.0));
}
