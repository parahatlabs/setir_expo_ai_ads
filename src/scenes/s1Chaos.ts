import type { WorldState } from './state';
import { S } from '../core/timeline';
import { clamp, ease, hash, ramp, smooth } from '../core/math';

/**
 * SCENE 1 — CHAOS. Evening, cold palette. Paper stacks grow, the clock spins,
 * the inbox counter climbs, red badges pop over every monitor, workers hunch.
 * This scene also defines the "before" baseline that later scenes transform.
 */
const T0 = S(0);
export const BADGE_POP = [0, 1, 2, 3, 4, 5].map((i) => T0 + 1.4 + i * 0.75 + hash(i) * 0.4);

/** Paper stack height (0..1) produced by the chaos scene for desk i at time t. */
export function chaosFill(i: number, t: number) {
  const g = ramp(t, T0 + 0.3 + i * 0.25, T0 + 11.5 + hash(i + 9) * 1.2);
  return 0.18 + 0.78 * Math.pow(g, 0.8) * (0.85 + hash(i + 4) * 0.15);
}

/** Inbox counter value during chaos (persists afterwards). */
export function chaosInbox(t: number) {
  const x = clamp(t - T0, 0, 13);
  return Math.round(64 + x * 46 + x * x * 3.6);
}

export function apply(t: number, s: WorldState) {
  for (let i = 0; i < 6; i++) {
    s.paperFill[i] = chaosFill(i, t);
    const pop = BADGE_POP[i];
    const p = ramp(t, pop, pop + 0.55);
    // badge number climbs in jumps; each jump gives a little bounce
    const lv = clamp((t - pop) / 1.9, 0, 5.999);
    const frac = lv - Math.floor(lv);
    const bump = lv > 0.2 ? Math.exp(-frac * 9) * 0.28 : 0;
    s.badgeSize[i] = p <= 0 ? 0 : 0.36 * ease.outBack(p) * (1 + bump);
    s.badgeLevel[i] = Math.floor(lv);
    s.screenAlert[i] = smooth(ramp(t, pop - 0.3, pop + 0.4));
    const pose = s.poses[i];
    pose.hunch = 0.35 + 0.6 * smooth(ramp(t, T0 + 1 + i * 0.3, T0 + 8));
    pose.type = 0.9 + 0.1 * Math.sin(i * 3.1);
    // occasional frustrated head shake
    const cyc = (s.time * 0.21 + hash(i + 20)) % 1;
    pose.shake = t < S(1, 2) ? smooth(clamp((cyc - 0.82) * 10)) * (1 - smooth(clamp((cyc - 0.93) * 14))) : 0;
  }
  s.clockSpeed = 0.05 + 1.6 * smooth(ramp(t, T0 + 0.5, T0 + 6));
  s.inbox = chaosInbox(t);
  s.lamp.fill(1);
}
