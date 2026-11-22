import type { WorldState } from './state';
import { S, addCue } from '../core/timeline';
import { ease, ramp, smooth, window4 } from '../core/math';

/**
 * SCENE 4 — SECURITY: YOU CHOOSE. The frame wipes into a split screen of the
 * same office. Left (A): a shield dome closes, data bounces back inside.
 * Right (B): one thin encrypted beam links the building to a cloud node.
 * The split then resolves into view B, which flows on into scene 5.
 */
const T0 = S(3);
export const SPLIT_IN = [T0 + 1.4, T0 + 3.1];
export const SPLIT_OUT = [T0 + 12.6, T0 + 14.5];
addCue(T0 + 3.3, 'shield');
addCue(T0 + 3.6, 'beam');

export function apply(t: number, s: WorldState) {
  if (t < T0 - 0.5) return;
  const inn = ease.inOutCubic(ramp(t, SPLIT_IN[0], SPLIT_IN[1]));
  const out = ease.inOutCubic(ramp(t, SPLIT_OUT[0], SPLIT_OUT[1]));
  s.divider = 1 - 0.5 * inn - 0.5 * out;
  s.dome = smooth(ramp(t, T0 + 3.2, T0 + 6.4)) * (1 - smooth(ramp(t, T0 + 11.8, T0 + 13.0)));
  s.bounce = window4(t, T0 + 5.6, T0 + 6.6, T0 + 11.6, T0 + 12.6);
  s.beam = smooth(ramp(t, T0 + 3.5, T0 + 6.3));
  s.beamAlpha = 1 - smooth(ramp(t, T0 + 13.6, T0 + 15.8));
  s.splitLabels = window4(t, T0 + 5.6, T0 + 6.6, T0 + 12.0, T0 + 12.8);
  const morning = smooth(ramp(t, T0 + 2, T0 + 10));
  for (let i = 0; i < s.lamp.length; i++) s.lamp[i] = Math.max(s.lamp[i], 0.12 + 0.3 * morning);
  for (let i = 0; i < 6; i++) {
    const p = s.poses[i];
    p.look *= 1 - 0.75 * morning;
    p.type = 0.35 * morning;
    p.hunch = Math.max(p.hunch, 0.25 * morning);
    s.screenPower[i] = Math.max(s.screenPower[i], 0.65 + 0.35 * morning);
  }
}
