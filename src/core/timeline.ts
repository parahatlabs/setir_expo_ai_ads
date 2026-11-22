/**
 * THE MASTER TIMELINE
 * ───────────────────
 * The whole story is one film of FILM_DURATION seconds. Every visual (camera,
 * lights, 3D objects, headlines, counters, sound cues) is a pure function of
 * film time `t`. Playback drivers only decide *how* `t` moves:
 *   • scroll mode → t = scrollProgress × FILM_DURATION
 *   • kiosk mode  → t advances with real time and loops
 * So nothing is animated twice.
 */

export type SceneId = 'chaos' | 'spark' | 'training' | 'security' | 'agents' | 'calm';

export interface SceneDef {
  id: SceneId;
  start: number;
  end: number;
  /** Film time a "jump to scene" lands on (headline fully visible). */
  focus: number;
  /** Headline window (seconds, absolute) — in/out of the split-text reveal. */
  headlineIn: number;
  headlineOut: number;
}

const D = [13, 11, 14, 15, 15, 16]; // scene durations (s) → 84 s film
const ids: SceneId[] = ['chaos', 'spark', 'training', 'security', 'agents', 'calm'];

let acc = 0;
export const SCENES: SceneDef[] = ids.map((id, i) => {
  const start = acc;
  const end = acc + D[i];
  acc = end;
  return {
    id,
    start,
    end,
    focus: start + Math.min(4.2, D[i] * 0.35),
    headlineIn: start + (i === 0 ? 1.2 : 1.0),
    headlineOut: end - 1.0,
  };
});

// Per-scene headline timing tweaks (story beats).
SCENES[1].headlineIn = SCENES[1].start + 6.6; // after the spark has landed
SCENES[1].focus = SCENES[1].start + 8.2;
SCENES[3].headlineIn = SCENES[3].start + 0.5;
SCENES[3].headlineOut = SCENES[3].start + 5.4;
SCENES[3].focus = SCENES[3].start + 7.5;
SCENES[5].headlineIn = SCENES[5].start + 10.2; // final screen
SCENES[5].headlineOut = Infinity;
SCENES[5].focus = SCENES[5].start + 12.5;

export const FILM_DURATION = acc;

/** Absolute time helper: S(2, 3.5) → 3.5 s into scene index 2. */
export const S = (i: number, offset = 0) => SCENES[i].start + offset;

export function sceneIndexAt(t: number): number {
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= SCENES[i].start) return i;
  return 0;
}

/** Discrete cue points (sound blips etc.). Fired when playback crosses them forwards. */
export interface Cue {
  t: number;
  kind: 'whoosh' | 'land' | 'absorb' | 'shield' | 'beam' | 'launch' | 'done' | 'calm' | 'final';
}

export const CUES: Cue[] = [];
export function addCue(t: number, kind: Cue['kind']) {
  CUES.push({ t, kind });
  CUES.sort((a, b) => a.t - b.t);
}
