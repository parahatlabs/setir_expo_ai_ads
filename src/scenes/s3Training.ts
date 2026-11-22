import type { WorldState } from './state';
import { S, addCue } from '../core/timeline';
import { ramp, smooth, window4 } from '../core/math';

/**
 * SCENE 3 — TRAINING. Documents lift off the desks and dissolve into particle
 * streams that flow into the Core. It grows, shifts to the brand accent and
 * shows data patterns on its surface.
 */
const T0 = S(2);
addCue(T0 + 2.6, 'absorb');

export function apply(t: number, s: WorldState) {
  if (t < T0 - 0.5) return;
  s.cards = ramp(t, T0 + 0.6, T0 + 9.6);
  s.stream = window4(t, T0 + 2.2, T0 + 4.2, T0 + 11.2, T0 + 13.4);
  const c = s.core;
  const learn = smooth(ramp(t, T0 + 2.5, T0 + 12.0));
  c.scale = 1 + 0.42 * learn;
  c.accent = smooth(ramp(t, T0 + 5, T0 + 12));
  c.data = smooth(ramp(t, T0 + 3, T0 + 10));
  c.absorb = s.stream * 0.7;
  c.energy = 1.05 + 0.25 * s.stream;
  c.halo += 0.25 * s.stream;
  const sync = window4(t, T0 + 1.6, T0 + 3.2, T0 + 11.8, T0 + 13.6);
  for (let i = 0; i < 6; i++) {
    s.screenSync[i] = sync;
    s.screenAlert[i] *= 1 - 0.7 * sync;
    s.poses[i].look = Math.max(s.poses[i].look * (1 - 0.3 * learn), 0.55);
  }
}
