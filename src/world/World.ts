import { Color, PerspectiveCamera, Vector2, Vector3, type Texture } from 'three';
import { Island } from './Island';
import { Office } from './Office';
import { Workers } from './Workers';
import { Papers } from './Papers';
import { Billboards } from './Billboards';
import { CELL_ID, createAtlas } from './textures';
import { DESKS } from './layout';
import { AICore } from '../fx/AICore';
import { DataStream } from '../fx/DataStream';
import { DocCards } from '../fx/DocCards';
import { Dome } from '../fx/Dome';
import { Beam } from '../fx/Beam';
import { Drones } from '../fx/Drones';
import type { WorldState } from '../scenes/state';
import type { Stage } from '../render/Stage';
import type { Atmosphere } from '../render/Atmosphere';
import { config } from '../config';
import { S } from '../core/timeline';
import { damp } from '../core/math';

const _v = new Vector3();
const _size = new Vector2();
const _white = new Color(1, 1, 1);
const _red = new Color(1.2, 0.92, 0.92);

/** Pool sizes at 100 % (high tier). Lower tiers draw a fraction. */
const STREAM_PARTICLES = 26000;
const DOME_PARTICLES = 3200;

/**
 * Assembles the diorama and every effect, and maps a WorldState onto them.
 */
export class World {
  readonly atlas: Texture;
  readonly island: Island;
  readonly office: Office;
  readonly workers: Workers;
  readonly papers: Papers;
  readonly badges: Billboards;
  readonly cards: Billboards;
  readonly core: AICore;
  readonly stream: DataStream;
  readonly docs: DocCards;
  readonly dome: Dome;
  readonly beam: Beam;
  readonly drones: Drones;
  /** Integrated wall-clock time in hours (spins fast in chaos, normal at the end). */
  clockHours = 18.6;

  constructor(private stage: Stage) {
    const low = stage.quality.tier === 'low';
    this.atlas = createAtlas(config.brandAccentColor);
    this.island = new Island(low);
    this.office = new Office();
    this.workers = new Workers();
    this.papers = new Papers();
    this.badges = new Billboards(DESKS.length, this.atlas);
    this.cards = new Billboards(DESKS.length, this.atlas);
    this.core = new AICore(config.brandAccentColor, low);
    this.stream = new DataStream(STREAM_PARTICLES);
    this.docs = new DocCards(this.atlas);
    this.dome = new Dome(DOME_PARTICLES);
    this.beam = new Beam(this.atlas);
    this.drones = new Drones(this.atlas, config.brandAccentColor);

    const sc = stage.scene;
    sc.add(this.island.group, this.office.group, this.workers.group, this.papers.mesh);
    sc.add(this.badges.mesh, this.cards.mesh, this.docs.mesh);
    sc.add(this.core.group, ...this.core.worldObjects, this.stream.points);
    sc.add(this.dome.group, this.beam.group, this.drones.group);
    this.applyQuality();
  }

  applyQuality() {
    const f = this.stage.quality.particleScale;
    this.stream.setDrawFraction(f);
    this.dome.setDrawFraction(Math.max(0.35, f));
  }

  update(s: WorldState, dt: number, atmo: Atmosphere, cam: PerspectiveCamera) {
    const time = s.time;
    const t = s.t;

    /* island */
    this.island.update(time);
    this.island.setLampLevel(atmo.lamps);
    this.island.setCloudTint(atmo.horizon, 0.35);

    /* office: screens, lamps, clock, tv */
    const o = this.office;
    for (let i = 0; i < DESKS.length; i++) o.setScreen(i, s.screenAlert[i], s.screenSync[i], s.screenCalm[i], s.screenPower[i]);
    o.commitScreens();
    o.setScreenTime(time);
    for (let i = 0; i < s.lamp.length; i++) o.setLamp(i, s.lamp[i], s.lampWarm);
    o.commitLamps();
    // the clock integrates its speed; in the calm ending it settles to ~17:05
    if (t < 0.05) this.clockHours = 18.6;
    this.clockHours += s.clockSpeed * dt;
    if (t > S(5, 0)) {
      const target = 17.05 + (t - S(5, 0)) / 60;
      const cur = this.clockHours % 12;
      this.clockHours = damp(cur, target % 12, 1.5, dt);
    }
    o.minuteHand.rotation.z = -(this.clockHours % 1) * Math.PI * 2;
    o.hourHand.rotation.z = -((this.clockHours % 12) / 12) * Math.PI * 2;
    o.drawTv(s.inbox, s.inboxDone, s.tvPower);

    /* paper, workers */
    this.papers.update(s.paperFill, s.paperAbsorb, time);
    this.workers.update(s.poses, time);

    /* notification badges (red → green) + task cards */
    for (let i = 0; i < DESKS.length; i++) {
      const d = DESKS[i];
      _v.copy(d.badge);
      _v.y += Math.sin(time * 2.2 + i) * 0.025;
      this.badges.set(i, _v, s.badgeSize[i], CELL_ID.badge[s.badgeLevel[i]], CELL_ID.badgeCheck, s.badgeGreen[i]);
      this.badges.setTint(i, s.badgeGreen[i] > 0.5 ? _white : _red, s.badgeGreen[i] > 0.5 ? 1.5 : 1.0);
      const tc = s.taskCard[i];
      _v.copy(d.card);
      _v.x += (1 - tc) * 0.45;
      _v.y += Math.sin(time * 1.7 + i * 2) * 0.015;
      this.cards.set(i, _v, 0.62 * Math.min(1, tc * 1.2), CELL_ID.task[i], CELL_ID.taskDone[i], s.taskCheck[i], tc);
    }
    this.badges.commit();
    this.cards.commit();

    /* hero + effects */
    const core = s.core;
    this.core.update(core, time, cam);
    // point sprites: world size → pixels. In split view each half uses the full buffer height.
    const bufH = this.stage.renderer.getDrawingBufferSize(_size).y;
    const scale = bufH / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.core.setSparkScale(bufH, cam);
    this.stream.setScale(scale);
    this.dome.setScale(scale);
    this.stream.update(s.stream, time, core.pos, this.core.color, _white);
    this.docs.update(s.cards, time, core.pos);
    this.dome.update(s.dome, s.bounce, time, this.core.color, core.pos);
    this.beam.update(s.beam, s.beamAlpha, time, this.core.color);
    this.drones.update(s.drones, core.pos, time);
  }
}
