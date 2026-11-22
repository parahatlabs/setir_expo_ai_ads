import {
  CapsuleGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { DESKS, exitPath } from './layout';
import { clamp, lerp } from '../core/math';

/**
 * Tiny low-poly office workers. Each worker is a small FK rig of Object3Ds
 * (never added to the scene) whose world matrices are copied into a handful
 * of InstancedMeshes — 6 workers × 9 parts = 5 draw calls total.
 */

export interface WorkerPose {
  /** 0 upright … 1 hunched over the desk (stress). */
  hunch: number;
  /** 0..1 look up towards the AI core. */
  look: number;
  /** typing intensity 0..1 */
  type: number;
  /** arms-up stretch 0..1 */
  stretch: number;
  /** 0 seated … 1 standing */
  stand: number;
  /** 0..1 progress along the exit path (after standing). */
  walk: number;
  /** head shake "frustration" 0..1 */
  shake: number;
}

export const newPose = (): WorkerPose => ({ hunch: 0, look: 0, type: 0, stretch: 0, stand: 0, walk: 0, shake: 0 });

interface Rig {
  root: Object3D;
  torso: Object3D;
  head: Object3D;
  hair: Object3D;
  armL: Object3D;
  armR: Object3D;
  thighL: Object3D;
  thighR: Object3D;
  shinL: Object3D;
  shinR: Object3D;
  path: Vector3[];
  lens: number[];
  total: number;
}

const SHIRTS = ['#d9694a', '#4f7cac', '#e0b04a', '#5f9e86', '#b0679a', '#6b7a8f'];
const SKIN = ['#f1c9a5', '#c99b74', '#8d5f3e', '#e6b48c', '#f3d2b8', '#a8774f'];
const HAIR = ['#2b2420', '#6b4a2f', '#151515', '#b5835a', '#3d2b22', '#d9c6a0'];

const _v = new Vector3();
const _m = new Matrix4();
const _hidden = new Matrix4().makeScale(0, 0, 0);

export class Workers {
  readonly group = new Group();
  private rigs: Rig[] = [];
  private torsoM: InstancedMesh;
  private headM: InstancedMesh;
  private hairM: InstancedMesh;
  private armM: InstancedMesh;
  private legM: InstancedMesh;

  constructor() {
    const n = DESKS.length;
    const torsoGeo = new CapsuleGeometry(0.15, 0.24, 3, 8);
    torsoGeo.translate(0, 0.27, 0); // pivot at hips
    const headGeo = new IcosahedronGeometry(0.135, 1);
    headGeo.translate(0, 0.12, 0); // pivot at neck
    const hairGeo = new SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairGeo.translate(0, 0.135, -0.012);
    const limbGeo = new CapsuleGeometry(0.048, 0.22, 2, 6);
    limbGeo.translate(0, -0.14, 0); // pivot at the joint (top)
    const legGeo = new CapsuleGeometry(0.058, 0.2, 2, 6);
    legGeo.translate(0, -0.14, 0);

    const mat = (rough = 0.85) => new MeshStandardMaterial({ roughness: rough, flatShading: true });
    this.torsoM = new InstancedMesh(torsoGeo, mat(), n);
    this.headM = new InstancedMesh(headGeo, mat(0.7), n);
    this.hairM = new InstancedMesh(hairGeo, mat(0.9), n);
    this.armM = new InstancedMesh(limbGeo, mat(), n * 2);
    this.legM = new InstancedMesh(legGeo, new MeshStandardMaterial({ color: '#2e3440', roughness: 0.9, flatShading: true }), n * 4);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      this.torsoM.setColorAt(i, c.set(SHIRTS[i]));
      this.armM.setColorAt(i * 2, c.set(SHIRTS[i]));
      this.armM.setColorAt(i * 2 + 1, c.set(SHIRTS[i]));
      this.headM.setColorAt(i, c.set(SKIN[i]));
      this.hairM.setColorAt(i, c.set(HAIR[i]));
    }
    for (const m of [this.torsoM, this.headM, this.hairM, this.armM, this.legM]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }

    for (const d of DESKS) {
      const root = new Object3D();
      const torso = new Object3D();
      const head = new Object3D();
      const hair = new Object3D();
      const armL = new Object3D();
      const armR = new Object3D();
      const thighL = new Object3D();
      const thighR = new Object3D();
      const shinL = new Object3D();
      const shinR = new Object3D();
      root.add(torso, thighL, thighR);
      torso.add(head, armL, armR);
      head.add(hair);
      thighL.add(shinL);
      thighR.add(shinR);
      head.position.set(0, 0.5, 0);
      armL.position.set(-0.19, 0.44, 0);
      armR.position.set(0.19, 0.44, 0);
      thighL.position.set(-0.08, 0.02, 0);
      thighR.position.set(0.08, 0.02, 0);
      shinL.position.set(0, -0.28, 0);
      shinR.position.set(0, -0.28, 0);
      const path = exitPath(d);
      const lens = [0];
      for (let k = 1; k < path.length; k++) lens.push(lens[k - 1] + path[k].distanceTo(path[k - 1]));
      this.rigs.push({ root, torso, head, hair, armL, armR, thighL, thighR, shinL, shinR, path, lens, total: lens[lens.length - 1] });
    }
  }

  /** Pose all workers. `time` is ambient seconds for idle motion. */
  update(poses: WorkerPose[], time: number) {
    this.rigs.forEach((r, i) => {
      const p = poses[i];
      const d = DESKS[i];
      const ph = i * 1.37;
      const walking = p.walk > 0;
      // ── root placement: seated at desk, or along the exit path
      // facing -z (towards the monitor); back-row workers swivel their chairs to face the core
      const swivel = d.row === 0 ? p.look * (d.x >= 0 ? 2.45 : -2.45) : p.look * -d.x * 0.1;
      let yaw = Math.PI + swivel * (1 - p.stand);
      const hipSeat = d.seat.y;
      const hipStand = 0.62;
      let hipY = lerp(hipSeat, hipStand, p.stand);
      r.root.position.set(d.seat.x, hipY, d.seat.z + p.stand * 0.12);
      let stride = 0;
      if (walking) {
        const dist = p.walk * r.total;
        let k = 1;
        while (k < r.lens.length - 1 && r.lens[k] < dist) k++;
        const a = r.path[k - 1];
        const b = r.path[k];
        const seg = clamp((dist - r.lens[k - 1]) / Math.max(1e-4, r.lens[k] - r.lens[k - 1]));
        _v.copy(a).lerp(b, seg);
        const tgtYaw = Math.atan2(b.x - a.x, b.z - a.z);
        yaw = tgtYaw;
        stride = Math.sin(dist * 9.0);
        hipY = hipStand + Math.abs(Math.cos(dist * 9.0)) * 0.03;
        r.root.position.set(_v.x, hipY, _v.z + (k === 1 ? p.stand * 0.12 * (1 - seg) : 0));
      }
      r.root.rotation.set(0, yaw, 0);

      // ── torso / head
      const breathe = Math.sin(time * 1.6 + ph) * 0.015;
      const typingBob = p.type * Math.sin(time * 16 + ph) * 0.02;
      r.torso.rotation.set(p.hunch * 0.42 - p.look * 0.12 - p.stretch * 0.1 + breathe + typingBob, 0, 0);
      const shake = p.shake * Math.sin(time * 9 + ph) * 0.35;
      r.head.rotation.set(p.hunch * 0.3 - p.look * 0.75 + Math.sin(time * 0.7 + ph) * 0.04, shake + p.look * -d.x * 0.08, 0);

      // ── arms: typing forward, stretch up, swing when walking
      const seatedArm = lerp(-1.25, -1.05, p.hunch);
      const tL = Math.sin(time * 18 + ph) * 0.12 * p.type;
      const tR = Math.sin(time * 18 + ph + 1.4) * 0.12 * p.type;
      const sitW = 1 - Math.max(p.stand, 0);
      const armBase = seatedArm * sitW;
      r.armL.rotation.set(armBase + tL + p.stretch * -1.9 * sitW + stride * 0.5 * (1 - sitW), 0, 0.12 + p.stretch * -0.25);
      r.armR.rotation.set(armBase + tR + p.stretch * -1.9 * sitW - stride * 0.5 * (1 - sitW), 0, -0.12 + p.stretch * 0.25);

      // ── legs: seated (thigh forward, shin down) → standing / walking
      const thighSit = -1.45;
      r.thighL.rotation.set(lerp(thighSit, stride * 0.55, p.stand), 0, 0);
      r.thighR.rotation.set(lerp(thighSit, -stride * 0.55, p.stand), 0, 0);
      r.shinL.rotation.set(lerp(1.45, Math.max(0, -stride) * 0.6, p.stand), 0, 0);
      r.shinR.rotation.set(lerp(1.45, Math.max(0, stride) * 0.6, p.stand), 0, 0);

      // pop out of existence at the end of the exit path
      const vis = p.walk >= 0.985 ? 0 : 1 - clamp((p.walk - 0.94) / 0.045) * 1;
      r.root.scale.setScalar(Math.max(0.0001, vis));
      r.root.updateMatrixWorld(true);

      if (vis <= 0.001) {
        this.torsoM.setMatrixAt(i, _hidden);
        this.headM.setMatrixAt(i, _hidden);
        this.hairM.setMatrixAt(i, _hidden);
        this.armM.setMatrixAt(i * 2, _hidden);
        this.armM.setMatrixAt(i * 2 + 1, _hidden);
        for (let k = 0; k < 4; k++) this.legM.setMatrixAt(i * 4 + k, _hidden);
        return;
      }
      this.torsoM.setMatrixAt(i, r.torso.matrixWorld);
      this.headM.setMatrixAt(i, r.head.matrixWorld);
      this.hairM.setMatrixAt(i, r.hair.matrixWorld);
      this.armM.setMatrixAt(i * 2, r.armL.matrixWorld);
      this.armM.setMatrixAt(i * 2 + 1, r.armR.matrixWorld);
      this.legM.setMatrixAt(i * 4, r.thighL.matrixWorld);
      this.legM.setMatrixAt(i * 4 + 1, r.thighR.matrixWorld);
      this.legM.setMatrixAt(i * 4 + 2, r.shinL.matrixWorld);
      this.legM.setMatrixAt(i * 4 + 3, r.shinR.matrixWorld);
    });
    for (const m of [this.torsoM, this.headM, this.hairM, this.armM, this.legM]) m.instanceMatrix.needsUpdate = true;
    void _m;
  }
}
