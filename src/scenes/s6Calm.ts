import type { WorldState } from './state';
import { S, addCue } from '../core/timeline';
import { ramp, smooth, window4 } from '../core/math';

/**
 * SCENE 6 — CALM. Warm golden light, clean desks, a normal clock. Workers
 * stretch and leave on time, lights dim one by one, the camera pulls out to
 * the whole peaceful island, and the final screen appears.
 */
const T0 = S(5);
export const STAND = [0, 1, 2, 3, 4, 5].map((i) => T0 + 1.6 + [0, 0.9, 0.4, 1.5, 2.1, 2.7][i]);
addCue(T0 + 0.4, 'calm');
addCue(T0 + 10.2, 'final');

export function apply(t: number, s: WorldState) {
  if (t < T0 - 0.5) return;
  const warm = smooth(ramp(t, T0 - 0.5, T0 + 3));
  s.lampWarm = warm;
  s.core.warm = smooth(ramp(t, T0 + 0.5, T0 + 4.5));
  s.core.energy = 1.05 - 0.3 * s.core.warm;
  s.core.rings = 1 - 0.5 * s.core.warm;
  s.clockSpeed = 0.03;
  s.tvPower = 1 - smooth(ramp(t, T0 + 3, T0 + 4));
  const dimBase = T0 + 6.0;
  for (let i = 0; i < s.lamp.length; i++) {
    const on = Math.max(s.lamp[i], warm);
    s.lamp[i] = on * (1 - smooth(ramp(t, dimBase + i * 0.55, dimBase + i * 0.55 + 0.5)));
  }
  for (let i = 0; i < 6; i++) {
    const st = STAND[i];
    const p = s.poses[i];
    p.stretch = Math.max(p.stretch, window4(t, st - 1.4, st - 0.8, st - 0.4, st) * 0.9);
    p.stand = smooth(ramp(t, st, st + 0.8));
    p.walk = ramp(t, st + 0.85, st + 7.2);
    p.type *= 1 - smooth(ramp(t, T0, T0 + 1));
    p.hunch = 0;
    s.screenPower[i] *= 1 - smooth(ramp(t, st + 0.2, st + 0.9));
    const hide = smooth(ramp(t, T0 + 2.2 + i * 0.25, T0 + 2.9 + i * 0.25));
    s.badgeSize[i] *= 1 - hide;
    s.taskCard[i] *= 1 - hide;
  }
  s.finalScreen = smooth(ramp(t, T0 + 9.6, T0 + 11.6));
}
