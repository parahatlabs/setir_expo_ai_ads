import type { WorldState } from './state';
import { S, addCue } from '../core/timeline';
import { clamp, ease, lerp, ramp, smooth, window4 } from '../core/math';
import { chaosFill, chaosInbox } from './s1Chaos';
import { config } from '../config';

/**
 * SCENE 5 — AGENTS AT WORK. The Core splits into six agent drones. Each flies
 * to a desk and clears it: the paper stack is absorbed, a task card slides in
 * with a check, the red badge turns green, the clock slows down.
 */
const T0 = S(4);
export const LAUNCH = [0, 1, 2, 3, 4, 5].map((i) => T0 + 0.7 + i * 0.32);
export const WORK = [0, 1, 2, 3, 4, 5].map((i) => T0 + 2.5 + i * 1.12);
export const WORK_DUR = 2.2;
export const DONE = WORK.map((w) => w + WORK_DUR);
export const RETURN = [0, 1, 2, 3, 4, 5].map((i) => T0 + 12.4 + i * 0.12);
addCue(LAUNCH[0], 'launch');
DONE.forEach((d) => addCue(d, 'done'));

export function apply(t: number, s: WorldState) {
  if (t < T0 - 0.5) return;
  const c = s.core;
  const split = smooth(ramp(t, LAUNCH[0] - 0.3, LAUNCH[5] + 1.0));
  c.scale = lerp(c.scale, 0.82, split);
  c.halo += window4(t, LAUNCH[0] - 0.2, LAUNCH[0], LAUNCH[0] + 0.2, LAUNCH[0] + 1.2) * 0.8;
  let doneCount = 0;
  for (let i = 0; i < 6; i++) {
    const d = s.drones[i];
    d.launch = ramp(t, LAUNCH[i], WORK[i]);
    d.work = ramp(t, WORK[i], DONE[i]);
    d.ret = ramp(t, RETURN[i], RETURN[i] + 1.8);
    const w = smooth(d.work);
    s.paperAbsorb[i] = d.work > 0 ? 1 : 0;
    s.paperFill[i] = chaosFill(i, t) * (1 - w);
    const done = smooth(ramp(t, DONE[i] - 0.25, DONE[i] + 0.15));
    doneCount += done;
    s.badgeGreen[i] = done;
    const popBoost = window4(t, DONE[i] - 0.1, DONE[i] + 0.05, DONE[i] + 0.1, DONE[i] + 0.7) * 0.45;
    s.badgeSize[i] *= 1 + popBoost;
    s.screenAlert[i] *= 1 - done;
    s.screenCalm[i] = done;
    s.taskCard[i] = ease.outCubic(ramp(t, WORK[i] + 0.25, WORK[i] + 0.95));
    s.taskCheck[i] = smooth(ramp(t, DONE[i] - 0.2, DONE[i] + 0.15));
    const p = s.poses[i];
    p.hunch *= 1 - done;
    p.look = Math.max(p.look, window4(t, LAUNCH[i], LAUNCH[i] + 0.5, WORK[i], WORK[i] + 0.6) * 0.5);
    p.type = lerp(p.type, 0.25, done);
    // a satisfied stretch once their desk is clear
    p.stretch = window4(t, DONE[i] + 0.3, DONE[i] + 1.0, DONE[i] + 2.2, DONE[i] + 3.0) * (i % 2 === 0 ? 1 : 0.6);
  }
  const frac = doneCount / 6;
  s.clockSpeed = lerp(s.clockSpeed, 0.03, smooth(clamp(frac * 1.15)));
  s.inbox = Math.round(chaosInbox(t) * (1 - frac));
  s.inboxDone = smooth(ramp(t, DONE[5], DONE[5] + 0.6));
  s.hoursSaved = config.hoursSavedPerWeek * ease.outQuart(ramp(t, WORK[0] + 0.5, DONE[5] + 0.8));
  s.counterVisible = window4(t, WORK[0], WORK[0] + 0.8, S(5, 5.5), S(5, 6.5));
  const day = smooth(ramp(t, T0, T0 + 4));
  for (let i = 0; i < s.lamp.length; i++) s.lamp[i] = lerp(s.lamp[i], 0.55, day);
}
