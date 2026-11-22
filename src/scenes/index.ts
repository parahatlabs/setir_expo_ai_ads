import { resetState, type WorldState } from './state';
import * as s1 from './s1Chaos';
import * as s2 from './s2Spark';
import * as s3 from './s3Training';
import * as s4 from './s4Security';
import * as s5 from './s5Agents';
import * as s6 from './s6Calm';

const scenes = [s1, s2, s3, s4, s5, s6];

/** Evaluate the whole story for film time t (pure; safe to scrub). */
export function evaluate(t: number, time: number, s: WorldState) {
  resetState(s);
  s.t = t;
  s.time = time;
  for (const sc of scenes) sc.apply(t, s);
}
