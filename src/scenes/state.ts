import { newCoreState, type CoreState } from '../fx/AICore';
import { newDroneState, type DroneState } from '../fx/Drones';
import { newPose, type WorkerPose } from '../world/Workers';
import { DESKS } from '../world/layout';
import { CORE_POS } from '../world/layout';

/**
 * The complete state of the world for one film time `t`.
 * Every frame: reset() → each scene's apply(t, state) in order → objects render.
 * Scenes only write the values they own (and persist their outcome after
 * their window), so the picture is a pure function of `t`.
 */
export interface WorldState {
  t: number;
  /** ambient seconds (idle loops: breathing, flicker, particle flow) */
  time: number;

  paperFill: number[];
  paperAbsorb: number[];
  /** Badge: size (0 hidden), atlas cell index into CELL_ID.badge, green 0..1 */
  badgeSize: number[];
  badgeLevel: number[];
  badgeGreen: number[];
  screenAlert: number[];
  screenSync: number[];
  screenCalm: number[];
  screenPower: number[];
  taskCard: number[];
  taskCheck: number[];
  lamp: number[];
  lampWarm: number;
  /** clock speed in clock-hours per real second */
  clockSpeed: number;
  /** clock time target (hours) for the calm ending */
  inbox: number;
  inboxDone: number;
  tvPower: number;
  poses: WorkerPose[];

  core: CoreState;
  stream: number;
  cards: number;
  dome: number;
  bounce: number;
  beam: number;
  beamAlpha: number;
  divider: number;
  drones: DroneState[];

  /** UI */
  hoursSaved: number;
  counterVisible: number;
  splitLabels: number;
  /** 0..1 how much the final screen overlay is shown */
  finalScreen: number;
}

const n = DESKS.length;
const arr = (v = 0) => new Array(n).fill(v);

export function createState(): WorldState {
  return {
    t: 0,
    time: 0,
    paperFill: arr(),
    paperAbsorb: arr(),
    badgeSize: arr(),
    badgeLevel: arr(),
    badgeGreen: arr(),
    screenAlert: arr(),
    screenSync: arr(),
    screenCalm: arr(),
    screenPower: arr(1),
    taskCard: arr(),
    taskCheck: arr(),
    lamp: new Array(n + 2).fill(1),
    lampWarm: 0,
    clockSpeed: 0.02,
    inbox: 0,
    inboxDone: 0,
    tvPower: 1,
    poses: DESKS.map(() => newPose()),
    core: newCoreState(),
    stream: 0,
    cards: 0,
    dome: 0,
    bounce: 0,
    beam: 0,
    beamAlpha: 1,
    divider: 1,
    drones: DESKS.map(() => newDroneState()),
    hoursSaved: 0,
    counterVisible: 0,
    splitLabels: 0,
    finalScreen: 0,
  };
}

export function resetState(s: WorldState) {
  for (let i = 0; i < n; i++) {
    s.paperFill[i] = 0;
    s.paperAbsorb[i] = 0;
    s.badgeSize[i] = 0;
    s.badgeLevel[i] = 0;
    s.badgeGreen[i] = 0;
    s.screenAlert[i] = 0;
    s.screenSync[i] = 0;
    s.screenCalm[i] = 0;
    s.screenPower[i] = 1;
    s.taskCard[i] = 0;
    s.taskCheck[i] = 0;
    const p = s.poses[i];
    p.hunch = p.look = p.type = p.stretch = p.stand = p.walk = p.shake = 0;
    const d = s.drones[i];
    d.launch = d.work = d.ret = 0;
  }
  s.lamp.fill(1);
  s.lampWarm = 0;
  s.clockSpeed = 0.02;
  s.inbox = 0;
  s.inboxDone = 0;
  s.tvPower = 1;
  const c = s.core;
  c.appear = 0;
  c.pos.copy(CORE_POS);
  c.scale = 1;
  c.energy = 1;
  c.accent = 0;
  c.warm = 0;
  c.data = 0;
  c.trail = 0;
  c.rings = 0;
  c.halo = 0;
  c.shock = 0;
  c.absorb = 0;
  s.stream = 0;
  s.cards = 0;
  s.dome = 0;
  s.bounce = 0;
  s.beam = 0;
  s.beamAlpha = 1;
  s.divider = 1;
  s.hoursSaved = 0;
  s.counterVisible = 0;
  s.splitLabels = 0;
  s.finalScreen = 0;
}
