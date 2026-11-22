import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { ToyBuilder, toyMaterial } from './builder';
import { ANTENNA_POS, CLOCK_POS, DESK_H, DESKS, DOOR, OFFICE, TV_POS } from './layout';
import { rng } from '../core/math';
import { GRASS_Y, OUTDOOR_LAMPS } from './Island';

const _c = new Color();

/**
 * The office building + furniture. Everything static is merged into one mesh;
 * animated parts (monitor screens, clock hands, wall TV, lamps) are exposed.
 */
export class Office {
  readonly group = new Group();
  readonly screens: InstancedMesh;
  readonly hourHand: Mesh;
  readonly minuteHand: Mesh;
  readonly lampHeads: InstancedMesh;
  readonly lightPools: InstancedMesh;
  readonly contactShadows: InstancedMesh;
  private tvCanvas: HTMLCanvasElement;
  private tvTex: CanvasTexture;
  private tvKey = '';
  readonly tv: Mesh;
  private screenAlert: InstancedBufferAttribute;
  private screenMode: InstancedBufferAttribute;
  private screenPower: InstancedBufferAttribute;

  constructor() {
    const R = rng(11);
    const b = new ToyBuilder();
    const { minX, maxX, minZ, maxZ, wallH, wallT } = OFFICE;
    const W = maxX - minX;
    const Dp = maxZ - minZ;

    /* ── floor slab (architectural-model white edges + plank floor) ───── */
    b.box(W + 0.5, 0.42, Dp + 0.5, '#efe9df', 0, -0.21 + 0.0, 0, { ao: 0.75 });
    // wide entrance step at the door
    b.boxB(0.6, 0.12, 1.4, '#e6e0d5', minX - 0.45, -0.3, DOOR.z);
    for (let i = 0; i < 14; i++) {
      const z = minZ + (i + 0.5) * (Dp / 14);
      b.box(W, 0.02, Dp / 14 - 0.012, i % 2 ? '#cdbda5' : '#c6b59c', 0, 0.0, z, { ao: 1 });
    }
    // rug under the core spot
    b.cyl(1.55, 1.55, 0.02, 32, '#a9b9c2', 0, 0.02, 0.15, { ao: 1 });
    b.cyl(1.3, 1.3, 0.022, 32, '#bccbd2', 0, 0.022, 0.15, { ao: 1 });

    /* ── walls (back + left), with window and door openings ───────────── */
    const wallC = '#ebe6dd';
    const capC = '#fbfaf7';
    const frameC = '#3a424d';
    const bz = minZ + wallT / 2;
    // back wall: x segments; windows in [-4.4,-2.3] and [2.3,4.4]
    const winY0 = 0.95;
    const winY1 = 2.3;
    const backSegs: [number, number, boolean][] = [
      [minX, -4.4, false], [-4.4, -2.3, true], [-2.3, 2.3, false], [2.3, 4.4, true], [4.4, maxX, false],
    ];
    for (const [x0, x1, win] of backSegs) {
      const cx = (x0 + x1) / 2;
      const w = x1 - x0;
      if (!win) b.boxB(w, wallH, wallT, wallC, cx, 0, bz);
      else {
        b.boxB(w, winY0, wallT, wallC, cx, 0, bz);
        b.boxB(w, wallH - winY1, wallT, wallC, cx, winY1, bz);
        // window frame + mullions
        b.boxB(w, 0.05, wallT + 0.06, frameC, cx, winY0 - 0.02, bz);
        b.boxB(w, 0.05, wallT + 0.04, frameC, cx, winY1 - 0.03, bz);
        b.boxB(0.04, winY1 - winY0, 0.05, frameC, cx, winY0, bz);
        b.boxB(w, 0.03, 0.05, frameC, cx, (winY0 + winY1) / 2, bz);
        // window sill plants
        b.cyl(0.08, 0.06, 0.12, 8, '#c8734f', cx - w * 0.3, winY0 + 0.07, bz + 0.14);
        b.blob(0.11, 0, '#6aa35a', cx - w * 0.3, winY0 + 0.2, bz + 0.14);
      }
    }
    b.boxB(W + wallT, 0.05, wallT + 0.02, capC, 0, wallH, bz, { ao: 1 });
    // left wall: z segments; window [-2.9,-0.5], door at DOOR.z
    const lx = minX + wallT / 2;
    const d0 = DOOR.z - DOOR.w / 2;
    const d1 = DOOR.z + DOOR.w / 2;
    const leftSegs: [number, number, 'wall' | 'win' | 'door'][] = [
      [minZ + wallT, -2.9, 'wall'], [-2.9, -0.5, 'win'], [-0.5, d0, 'wall'], [d0, d1, 'door'], [d1, maxZ, 'wall'],
    ];
    for (const [z0, z1, kind] of leftSegs) {
      const cz = (z0 + z1) / 2;
      const d = z1 - z0;
      if (kind === 'wall') b.boxB(wallT, wallH, d, wallC, lx, 0, cz);
      else if (kind === 'win') {
        b.boxB(wallT, winY0, d, wallC, lx, 0, cz);
        b.boxB(wallT, wallH - winY1, d, wallC, lx, winY1, cz);
        b.boxB(wallT + 0.06, 0.05, d, frameC, lx, winY0 - 0.02, cz);
        b.boxB(wallT + 0.04, 0.05, d, frameC, lx, winY1 - 0.03, cz);
        b.boxB(0.05, winY1 - winY0, 0.04, frameC, lx, winY0, cz);
        b.boxB(0.05, 0.03, d, frameC, lx, (winY0 + winY1) / 2, cz);
      } else {
        b.boxB(wallT, wallH - DOOR.h, d, wallC, lx, DOOR.h, cz);
        b.boxB(wallT + 0.04, 0.06, d + 0.1, frameC, lx, DOOR.h - 0.03, cz);
        b.boxB(wallT + 0.04, DOOR.h, 0.05, frameC, lx, 0, z0);
        b.boxB(wallT + 0.04, DOOR.h, 0.05, frameC, lx, 0, z1);
      }
    }
    b.boxB(wallT + 0.02, 0.05, Dp, capC, lx, wallH, 0, { ao: 1 });
    // skirting + open-side lips (cut-away diorama edge)
    b.boxB(W, 0.08, 0.03, '#5d6570', 0, 0, minZ + wallT + 0.015);
    b.boxB(0.03, 0.08, Dp - wallT, '#5d6570', minX + wallT + 0.015, 0, 0.1);
    b.boxB(W + 0.5, 0.06, 0.08, '#ddd6c9', 0, 0, maxZ + 0.21);
    b.boxB(0.08, 0.06, Dp + 0.5, '#ddd6c9', maxX + 0.21, 0, 0);

    // rooftop antenna (the cloud link starts here)
    b.boxB(0.5, 0.25, 0.5, '#d9d4cb', ANTENNA_POS.x, wallH, ANTENNA_POS.z);
    b.cyl(0.025, 0.035, 0.85, 6, '#3a424d', ANTENNA_POS.x, wallH + 0.25 + 0.42, ANTENNA_POS.z);
    b.cyl(0.18, 0.02, 0.08, 10, '#c9ced6', ANTENNA_POS.x, ANTENNA_POS.y - 0.02, ANTENNA_POS.z, { rx: -0.5, rz: -0.4 });

    /* ── desks, chairs, keyboards, monitors, lamps ────────────────────── */
    const mugs = ['#ff7b54', '#4f7cac', '#f2c14e', '#6aa38b', '#e86a92', '#f4f1de'];
    for (const d of DESKS) {
      const { x, z } = d;
      b.boxB(1.5, 0.05, 0.78, '#d6b98f', x, DESK_H - 0.05, z, { ao: 0.9 });
      b.boxB(0.04, DESK_H - 0.05, 0.7, '#e9e5de', x - 0.7, 0, z);
      b.boxB(0.04, DESK_H - 0.05, 0.7, '#e9e5de', x + 0.7, 0, z);
      b.boxB(1.36, 0.36, 0.03, '#dcd7ce', x, 0.32, z - 0.33);
      // monitor: stand + housing (screen is a separate glowing instance)
      b.boxB(0.22, 0.015, 0.14, '#2a3038', x, DESK_H, d.monitor.z - 0.02);
      b.boxB(0.05, 0.2, 0.03, '#2a3038', x, DESK_H, d.monitor.z - 0.05);
      b.box(0.68, 0.43, 0.04, '#1e232a', x, d.monitor.y, d.monitor.z - 0.025);
      // keyboard + mouse + mug
      b.boxB(0.44, 0.022, 0.14, '#2f353e', x, DESK_H, z + 0.16);
      b.boxB(0.06, 0.02, 0.09, '#2f353e', x + 0.32, DESK_H, z + 0.17);
      b.cyl(0.04, 0.035, 0.09, 10, mugs[d.index], x - 0.38, DESK_H + 0.045, z + 0.18);
      // lamp base + arm (head is emissive instance)
      b.cyl(0.07, 0.08, 0.03, 10, '#2d333b', d.lamp.x, DESK_H + 0.015, d.lamp.z + 0.05);
      b.box(0.02, 0.36, 0.02, '#2d333b', d.lamp.x, DESK_H + 0.2, d.lamp.z + 0.05, { rx: -0.25 });
      b.cyl(0.035, 0.11, 0.12, 12, '#2d333b', d.lamp.x, d.lamp.y + 0.05, d.lamp.z, { ao: 1 });
      // chair
      const cz = d.seat.z + 0.02;
      const seatC = ['#3b4654', '#4a3f52', '#3b4654', '#41504a', '#3b4654', '#523f3f'][d.index];
      b.boxB(0.5, 0.08, 0.48, seatC, x, 0.4, cz);
      b.boxB(0.48, 0.52, 0.07, seatC, x, 0.55, cz + 0.27, { rx: 0.08 });
      b.cyl(0.03, 0.03, 0.34, 6, '#2a2f36', x, 0.23, cz);
      b.boxB(0.5, 0.04, 0.06, '#2a2f36', x, 0.04, cz);
      b.boxB(0.06, 0.04, 0.5, '#2a2f36', x, 0.04, cz);
    }

    /* ── wall clock face, wall TV frame ───────────────────────────────── */
    b.cyl(0.36, 0.36, 0.05, 32, '#2b3139', CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.z, { rx: Math.PI / 2, ao: 1 });
    b.cyl(0.32, 0.32, 0.06, 32, '#f7f5ef', CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.z + 0.01, { rx: Math.PI / 2, ao: 1 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const big = i % 3 === 0;
      b.box(0.022, big ? 0.07 : 0.04, 0.01, '#2b3139', CLOCK_POS.x + Math.sin(a) * 0.26, CLOCK_POS.y + Math.cos(a) * 0.26, CLOCK_POS.z + 0.045, { rz: -a, ao: 1 });
    }
    b.box(1.36, 0.8, 0.05, '#1b1f25', TV_POS.x, TV_POS.y, TV_POS.z - 0.02, { ao: 1 });

    /* ── whiteboard with sticky notes, sideboards, plants, printer ───── */
    b.box(0.03, 0.95, 1.5, '#fafafa', minX + wallT + 0.02, 1.55, 0.55, { ao: 1 });
    b.box(0.04, 1.0, 1.55, '#9aa3ad', minX + wallT + 0.005, 1.55, 0.55, { ao: 1 });
    const notes = ['#ffd166', '#ff8fa3', '#8ecae6', '#b8f2a1'];
    for (let i = 0; i < 9; i++) {
      b.box(0.012, 0.14, 0.14, notes[i % 4], minX + wallT + 0.04, 1.3 + (i % 3) * 0.22 + R() * 0.03, 0.05 + Math.floor(i / 3) * 0.42 + R() * 0.05, { rx: (R() - 0.5) * 0.2, ao: 1 });
    }
    for (const cx of [-3.35, 3.35]) {
      b.boxB(2.0, 0.62, 0.42, '#e3ddd3', cx, 0, minZ + wallT + 0.22);
      for (let k = 0; k < 6; k++) b.boxB(0.07, 0.24, 0.2, ['#4f7cac', '#e07a5f', '#81b29a', '#f2cc8f'][k % 4], cx - 0.7 + k * 0.09, 0.62, minZ + wallT + 0.2, { rz: k === 5 ? 0.3 : 0 });
    }
    b.boxB(0.5, 0.25, 0.38, '#cfd3d9', 3.8, 0.62, minZ + wallT + 0.22);
    const plants: [number, number, number][] = [[-4.55, -2.95, 1], [4.55, 3.0, 1.2], [-4.5, 3.05, 0.9], [4.6, -0.8, 0.8]];
    for (const [x, z, s] of plants) {
      b.cyl(0.2 * s, 0.15 * s, 0.38 * s, 10, '#d07a52', x, 0.19 * s, z);
      b.blob(0.32 * s, 0, '#5c9a52', x, 0.62 * s, z, { ry: R() * 3 });
      b.blob(0.22 * s, 0, '#79b562', x + 0.15 * s, 0.85 * s, z - 0.05, { ry: R() * 3 });
    }
    // floor lamps
    for (const [x, z] of [[4.55, 1.2], [-4.55, -0.15]] as const) {
      b.cyl(0.14, 0.16, 0.04, 10, '#2d333b', x, 0.02, z);
      b.cyl(0.02, 0.02, 1.55, 6, '#2d333b', x, 0.8, z);
      b.cyl(0.08, 0.2, 0.2, 12, '#e9e2d4', x, 1.7, z, { ao: 0.9 });
    }

    const stat = new Mesh(b.build(), toyMaterial());
    stat.castShadow = true;
    stat.receiveShadow = true;
    this.group.add(stat);

    /* ── monitor screens (procedural UI shader, one draw call) ────────── */
    const sg = new PlaneGeometry(0.6, 0.36);
    this.screenAlert = new InstancedBufferAttribute(new Float32Array(DESKS.length), 1);
    this.screenMode = new InstancedBufferAttribute(new Float32Array(DESKS.length * 3), 3);
    this.screenPower = new InstancedBufferAttribute(new Float32Array(DESKS.length).fill(1), 1);
    sg.setAttribute('aAlert', this.screenAlert);
    sg.setAttribute('aMode', this.screenMode);
    sg.setAttribute('aPower', this.screenPower);
    this.screens = new InstancedMesh(sg, screenMaterial(), DESKS.length);
    const dm = new Object3D();
    DESKS.forEach((d, i) => {
      dm.position.copy(d.monitor);
      dm.position.z += 0.0;
      dm.updateMatrix();
      this.screens.setMatrixAt(i, dm.matrix);
    });
    this.group.add(this.screens);

    /* ── clock hands ──────────────────────────────────────────────────── */
    const handMat = new MeshBasicMaterial({ color: '#20252c' });
    const hg = new BoxGeometry(0.03, 0.17, 0.012);
    hg.translate(0, 0.07, 0);
    const mg = new BoxGeometry(0.02, 0.25, 0.012);
    mg.translate(0, 0.11, 0);
    this.hourHand = new Mesh(hg, handMat);
    this.minuteHand = new Mesh(mg, handMat);
    this.hourHand.position.set(CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.z + 0.05);
    this.minuteHand.position.set(CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.z + 0.06);
    this.group.add(this.hourHand, this.minuteHand);

    /* ── wall TV with live notification counter ───────────────────────── */
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 512;
    this.tvCanvas.height = 300;
    this.tvTex = new CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = SRGBColorSpace;
    this.tv = new Mesh(new PlaneGeometry(1.26, 0.72), new MeshBasicMaterial({ map: this.tvTex, toneMapped: true }));
    this.tv.position.set(TV_POS.x, TV_POS.y, TV_POS.z + 0.01);
    this.group.add(this.tv);
    this.drawTv(0, 0, 1);

    /* ── lamp heads (6 desk + 2 floor) + light pools on surfaces ──────── */
    const lampSpots = [
      ...DESKS.map((d) => d.lamp.clone()),
      { x: 4.55, y: 1.6, z: 1.2 },
      { x: -4.55, y: 1.6, z: -0.15 },
    ];
    const bulb = new SphereGeometry(0.06, 12, 8);
    bulb.scale(1, 0.55, 1);
    this.lampHeads = new InstancedMesh(bulb, new MeshBasicMaterial({ color: 0xffffff }), lampSpots.length);
    this.lightPools = new InstancedMesh(new PlaneGeometry(1, 1), poolMaterial(), lampSpots.length);
    lampSpots.forEach((p, i) => {
      dm.position.set(p.x, p.y, p.z);
      dm.rotation.set(0, 0, 0);
      dm.scale.setScalar(1);
      dm.updateMatrix();
      this.lampHeads.setMatrixAt(i, dm.matrix);
      const floor = i >= DESKS.length;
      dm.position.set(p.x + (floor ? 0 : 0.35), floor ? 0.03 : DESK_H + 0.003, p.z + (floor ? 0 : 0.18));
      dm.rotation.set(-Math.PI / 2, 0, 0);
      dm.scale.setScalar(floor ? 2.4 : 1.25);
      dm.updateMatrix();
      this.lightPools.setMatrixAt(i, dm.matrix);
      this.lampHeads.setColorAt(i, _c.setRGB(1, 1, 1));
      this.lightPools.setColorAt(i, _c.setRGB(0, 0, 0));
    });
    this.group.add(this.lampHeads, this.lightPools);

    /* ── contact shadows (soft AO blobs under furniture & trees) ──────── */
    const blobs: [number, number, number, number, number][] = []; // x,y,z,sx,sz
    for (const d of DESKS) {
      blobs.push([d.x, 0.025, d.z, 1.9, 1.1]);
      blobs.push([d.x, 0.026, d.seat.z + 0.05, 0.75, 0.75]);
    }
    for (const [x, z, s] of plants) blobs.push([x, 0.027, z, 0.9 * s, 0.9 * s]);
    blobs.push([-3.35, 0.027, minZ + 0.45, 2.4, 0.8], [3.35, 0.027, minZ + 0.45, 2.4, 0.8]);
    blobs.push([0, -0.0, 0, W + 2.2, Dp + 2.2]);
    for (const p of OUTDOOR_LAMPS) blobs.push([p.x, GRASS_Y + 0.012, p.z, 0.7, 0.7]);
    this.contactShadows = new InstancedMesh(new PlaneGeometry(1, 1), shadowBlobMaterial(), blobs.length);
    blobs.forEach(([x, y, z, sx, sz], i) => {
      dm.position.set(x, i === blobs.length - 1 - OUTDOOR_LAMPS.length ? GRASS_Y + 0.01 : y, z);
      dm.rotation.set(-Math.PI / 2, 0, 0);
      dm.scale.set(sx, sz, 1);
      dm.updateMatrix();
      this.contactShadows.setMatrixAt(i, dm.matrix);
    });
    this.contactShadows.renderOrder = -1;
    this.group.add(this.contactShadows);
  }

  /** Per-desk monitor look: alert (red flashing), sync (cyan data), calm (green), power. */
  setScreen(i: number, alert: number, sync: number, calm: number, power: number) {
    this.screenAlert.setX(i, alert);
    this.screenMode.setXYZ(i, sync, calm, 0);
    this.screenPower.setX(i, power);
  }
  commitScreens() {
    this.screenAlert.needsUpdate = true;
    this.screenMode.needsUpdate = true;
    this.screenPower.needsUpdate = true;
  }
  setScreenTime(time: number) {
    (this.screens.material as ShaderMaterial).uniforms.uTime.value = time;
  }

  /** Lamp level 0..1 per lamp; warm tint. */
  setLamp(i: number, level: number, warm: number) {
    const l = Math.max(0, level);
    _c.setRGB(2.6 * l + 0.05, (2.0 + warm * 0.2) * l + 0.05, (1.3 - warm * 0.5) * l + 0.06);
    this.lampHeads.setColorAt(i, _c);
    _c.setRGB(0.5 * l, 0.36 * l, (0.2 - warm * 0.06) * l);
    this.lightPools.setColorAt(i, _c);
  }
  commitLamps() {
    this.lampHeads.instanceColor!.needsUpdate = true;
    this.lightPools.instanceColor!.needsUpdate = true;
  }

  /** Redraws the wall TV only when the visible content changes. */
  drawTv(count: number, done: number, power: number) {
    const key = `${count}|${Math.round(done * 20)}|${Math.round(power * 10)}`;
    if (key === this.tvKey) return;
    this.tvKey = key;
    const c = this.tvCanvas.getContext('2d')!;
    const W = 512;
    const H = 300;
    c.fillStyle = '#0b0e13';
    c.fillRect(0, 0, W, H);
    if (power > 0.05) {
      c.globalAlpha = power;
      const bad = 1 - done;
      const bg = c.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, done > 0.5 ? '#0f2a22' : '#2a0f14');
      bg.addColorStop(1, '#0b0e13');
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      // envelope glyph
      c.strokeStyle = done > 0.5 ? '#35e08a' : '#ff3b4a';
      c.lineWidth = 10;
      c.lineJoin = 'round';
      c.strokeRect(40, 92, 120, 86);
      c.beginPath();
      c.moveTo(44, 96);
      c.lineTo(100, 142);
      c.lineTo(156, 96);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = '800 112px Manrope, sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      if (done > 0.5) {
        c.fillStyle = '#35e08a';
        c.beginPath();
        c.lineWidth = 22;
        c.strokeStyle = '#35e08a';
        c.lineCap = 'round';
        c.moveTo(250, 140);
        c.lineTo(300, 190);
        c.lineTo(400, 86);
        c.stroke();
      } else c.fillText(count.toLocaleString('en-US'), 190, 140);
      // progress bar of the backlog
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(40, 236, 432, 14);
      c.fillStyle = done > 0.5 ? '#35e08a' : '#ff3b4a';
      c.fillRect(40, 236, 432 * Math.min(1, bad * Math.min(1, count / 900) + done), 14);
      c.globalAlpha = 1;
    }
    this.tvTex.needsUpdate = true;
  }
}

/* ── materials ────────────────────────────────────────────────────────── */

function screenMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aAlert; attribute vec3 aMode; attribute float aPower;
      varying vec2 vUv; varying float vAlert; varying vec3 vMode; varying float vPower; varying float vId;
      void main(){
        vUv = uv; vAlert = aAlert; vMode = aMode; vPower = aPower; vId = float(gl_InstanceID);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv; varying float vAlert; varying vec3 vMode; varying float vPower; varying float vId;
      float h(float n){ return fract(sin(n * 91.345) * 47453.12); }
      void main(){
        vec2 uv = vUv;
        // base app chrome
        vec3 base = vec3(0.10, 0.16, 0.24);
        vec3 ink = vec3(0.55, 0.68, 0.85);
        float row = floor((uv.y + uTime * (0.05 + vMode.x * 0.6)) * 14.0);
        float rw = 0.25 + h(row + vId * 13.0) * 0.6;
        float lines = step(0.18, fract((uv.y + uTime * (0.05 + vMode.x * 0.6)) * 14.0)) * step(fract((uv.y + uTime*(0.05+vMode.x*0.6)) * 14.0), 0.62);
        lines *= step(0.08, uv.x) * step(uv.x, 0.08 + rw * 0.84) * step(uv.y, 0.82);
        float header = step(0.86, uv.y);
        float side = step(uv.x, 0.05);
        vec3 col = base + ink * lines * 0.55 + vec3(0.22, 0.3, 0.42) * (header + side * 0.5);
        // alert: red header + pulsing warning block
        float pulse = 0.5 + 0.5 * sin(uTime * 7.0 + vId * 1.7);
        vec3 red = vec3(1.0, 0.16, 0.2);
        col = mix(col, col * vec3(1.0, 0.55, 0.55), vAlert * 0.6);
        col += red * header * vAlert * (0.8 + pulse * 1.4);
        float box = step(0.6, uv.x) * step(uv.x, 0.92) * step(0.2, uv.y) * step(uv.y, 0.52);
        col = mix(col, red * (0.8 + pulse * 1.2), box * vAlert * step(0.35, pulse));
        // sync: cyan streaming data
        vec3 cyan = vec3(0.2, 0.95, 1.2);
        float stream = step(0.6, h(floor(uv.x * 30.0) + floor(uv.y * 18.0 - uTime * 6.0) * 7.0));
        col = mix(col, cyan * (0.25 + stream * 0.9), vMode.x * 0.85);
        // calm: soft green dashboard with a check bar
        vec3 green = vec3(0.25, 0.95, 0.6);
        vec3 calm = vec3(0.07, 0.2, 0.17) + green * lines * 0.35 + green * header * 0.7;
        col = mix(col, calm, vMode.y);
        col *= vPower;
        gl_FragColor = vec4(col * 1.35, 1.0);
      }`,
  });
}

function poolMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vCol;
      void main(){ vUv = uv; vCol = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vCol;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-d*d*3.5) * (1.0 - smoothstep(0.85, 1.0, d)); gl_FragColor = vec4(vCol * a, 1.0); }`,
  });
}

function shadowBlobMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: { uStrength: { value: 0.32 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength; varying vec2 vUv;
      void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d); float a = (1.0 - smoothstep(0.25, 1.0, r)); gl_FragColor = vec4(0.03, 0.03, 0.05, a * a * uStrength); }`,
  });
}
