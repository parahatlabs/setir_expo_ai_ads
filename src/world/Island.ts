import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ToyBuilder, toyMaterial } from './builder';
import { rng } from '../core/math';
import { DOOR } from './layout';

/** Ellipse radii of the island top. */
export const ISLAND_RX = 9.6;
export const ISLAND_RZ = 8.2;
export const GRASS_Y = -0.3;

// deterministic 3D value noise for terrain jitter
function vnoise(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Exterior lamp-post head positions (they switch on at dusk). */
export const OUTDOOR_LAMPS = [
  new Vector3(-6.3, 1.55, 4.9),
  new Vector3(5.9, 1.55, 4.6),
  new Vector3(-1.6, 1.55, 5.9),
  new Vector3(7.4, 1.55, -1.2),
];

/**
 * The floating diorama island: layered rock body, grass top, trees, path,
 * lamp posts, small floating rocks and soft low-poly clouds.
 */
export class Island {
  readonly group = new Group();
  readonly lampHeads: InstancedMesh;
  private rocks: InstancedMesh;
  private rockData: { r: number; a: number; y: number; s: number; sp: number }[] = [];
  private clouds: InstancedMesh;
  private cloudData: { x: number; y: number; z: number; s: number; sp: number }[] = [];
  private dummy = new Object3D();

  constructor(lowDetail = false) {
    const R = rng(7);

    /* ── rock body ─────────────────────────────────────────────────────── */
    const rockGeo = new CylinderGeometry(1, 0.06, 1, lowDetail ? 22 : 34, 8, false);
    rockGeo.translate(0, -0.5, 0);
    const pos = rockGeo.getAttribute('position') as BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const cTop = new Color('#9a7656');
    const cMid = new Color('#6f5b4c');
    const cLow = new Color('#463d3a');
    const cBand = new Color('#86705e');
    const tmp = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const k = -y; // 0 at top → 1 at tip
      const n = vnoise(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50));
      const radial = k < 0.02 ? 1 : 1 + (n - 0.5) * 0.28 * Math.min(1, k * 3);
      const yj = k < 0.02 ? 0 : (vnoise(Math.round(z * 40), Math.round(y * 40), Math.round(x * 40)) - 0.5) * 0.06;
      pos.setXYZ(i, x * radial * ISLAND_RX, (y + yj) * 6.2 + GRASS_Y - 0.25, z * radial * ISLAND_RZ);
      if (k < 0.12) tmp.copy(cTop);
      else if (k < 0.5) tmp.copy(cMid).lerp(cBand, Math.sin(k * 28) > 0.6 ? 0.6 : 0);
      else tmp.copy(cMid).lerp(cLow, Math.min(1, (k - 0.5) * 2.2));
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    rockGeo.setAttribute('color', new BufferAttribute(cols, 3));
    const rockFlat = rockGeo.toNonIndexed();
    rockFlat.computeVertexNormals();
    const rock = new Mesh(rockFlat, toyMaterial({ rough: 0.95 }));
    rock.receiveShadow = true;
    this.group.add(rock);

    /* ── grass top + everything on it (one merged mesh) ───────────────── */
    const b = new ToyBuilder();
    const grass = new CylinderGeometry(1, 0.985, 0.32, lowDetail ? 40 : 64, 1);
    const gp = grass.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const a = Math.atan2(z, x);
      const wob = 1 + Math.sin(a * 5 + 1.3) * 0.018 + Math.sin(a * 11) * 0.01;
      gp.setXYZ(i, x * ISLAND_RX * 1.015 * wob, gp.getY(i), z * ISLAND_RZ * 1.015 * wob);
    }
    b.add(grass, '#87ad62', 0, GRASS_Y - 0.16, 0, { ao: 0.62 });
    // darker lawn patches for depth
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2;
      const rr = 0.55 + R() * 0.38;
      const x = Math.cos(a) * ISLAND_RX * rr;
      const z = Math.sin(a) * ISLAND_RZ * rr;
      if (Math.abs(x) < 5.6 && Math.abs(z) < 4.1) continue;
      b.cyl(0.6 + R() * 0.9, 0.6 + R() * 0.9, 0.02, 9, R() > 0.5 ? '#7aa158' : '#93b96c', x, GRASS_Y + 0.005, z, { ao: 1 });
    }

    // stepping-stone path from the office door out across the lawn
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = DOOR.x - 0.6 - t * 2.4 - Math.sin(t * 3) * 0.2;
      const z = DOOR.z + t * 3.1;
      b.cyl(0.24, 0.26, 0.05, 7, '#d8d2c6', x + (R() - 0.5) * 0.15, GRASS_Y + 0.02, z, { ry: R() * 3 });
    }

    // trees — mix of round and conifer types
    const trees: [number, number, number, number][] = [
      [-7.4, -2.6, 1.15, 0], [-6.5, -5.0, 0.95, 1], [-3.2, -5.9, 1.05, 0], [2.4, -6.2, 1.2, 1],
      [6.6, -4.0, 1.1, 0], [7.9, 1.3, 0.9, 1], [6.3, 4.7, 1.0, 0], [-8.0, 1.0, 0.8, 1],
      [4.2, -6.0, 0.8, 0], [-4.4, 6.4, 0.75, 1], [8.3, -1.9, 0.7, 0],
    ];
    for (const [x, z, s, kind] of trees) {
      b.cyl(0.08 * s, 0.11 * s, 0.9 * s, 6, '#6b4f3a', x, GRASS_Y + 0.45 * s, z);
      if (kind === 0) {
        b.blob(0.62 * s, 0, '#5f9450', x, GRASS_Y + 1.2 * s, z, { ry: R() * 3 });
        b.blob(0.45 * s, 0, '#79ab5c', x + 0.28 * s, GRASS_Y + 1.5 * s, z + 0.1 * s, { ry: R() * 3 });
      } else {
        for (let k = 0; k < 3; k++) {
          b.cyl(0.02, (0.62 - k * 0.15) * s, 0.75 * s, 7, k % 2 ? '#4f8a52' : '#5e9a5c', x, GRASS_Y + (0.95 + k * 0.42) * s, z, { ry: k });
        }
      }
    }
    // bushes + flowers
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2;
      const rr = 0.66 + R() * 0.28;
      const x = Math.cos(a) * ISLAND_RX * rr;
      const z = Math.sin(a) * ISLAND_RZ * rr;
      if (Math.abs(x) < 5.7 && Math.abs(z) < 4.2) continue;
      b.blob(0.22 + R() * 0.2, 0, R() > 0.5 ? '#6c9d55' : '#8bb767', x, GRASS_Y + 0.12, z, { sy: 0.75 });
      if (R() > 0.4) {
        const fc = ['#ff8fa3', '#ffd166', '#f4f1de', '#c8a2ff'][Math.floor(R() * 4)];
        for (let f = 0; f < 4; f++) b.box(0.06, 0.06, 0.06, fc, x + (R() - 0.5) * 0.7, GRASS_Y + 0.05, z + (R() - 0.5) * 0.7, { ao: 1 });
      }
    }
    // small rocks on the lawn
    for (let i = 0; i < 8; i++) {
      const a = R() * Math.PI * 2;
      const x = Math.cos(a) * ISLAND_RX * 0.86;
      const z = Math.sin(a) * ISLAND_RZ * 0.86;
      b.blob(0.14 + R() * 0.16, 0, '#9d968c', x, GRASS_Y + 0.05, z, { sy: 0.6, ry: R() * 3 });
    }
    // lamp posts
    for (const p of OUTDOOR_LAMPS) {
      b.cyl(0.035, 0.05, 1.75, 6, '#2d333b', p.x, GRASS_Y + 0.87, p.z, { ao: 0.9 });
      b.cyl(0.14, 0.16, 0.05, 8, '#2d333b', p.x, GRASS_Y + 0.02, p.z);
      b.cyl(0.13, 0.05, 0.08, 8, '#2d333b', p.x, p.y + 0.12, p.z);
    }
    // benches
    for (const [x, z, ry] of [[-2.8, 5.6, 0.2], [5.2, 5.6, -0.5]] as const) {
      b.boxB(1.1, 0.06, 0.36, '#b07a4f', x, GRASS_Y + 0.36, z, { ry });
      b.boxB(1.1, 0.3, 0.05, '#b07a4f', x - Math.sin(ry) * 0.17, GRASS_Y + 0.44, z - Math.cos(ry) * 0.17, { ry });
      b.boxB(0.06, 0.36, 0.3, '#2d333b', x - Math.cos(ry) * 0.45, GRASS_Y, z + Math.sin(ry) * 0.45, { ry });
      b.boxB(0.06, 0.36, 0.3, '#2d333b', x + Math.cos(ry) * 0.45, GRASS_Y, z - Math.sin(ry) * 0.45, { ry });
    }
    const top = new Mesh(b.build(), toyMaterial());
    top.receiveShadow = true;
    top.castShadow = true;
    this.group.add(top);

    /* ── lamp heads (emissive, intensity animated) ─────────────────────── */
    this.lampHeads = new InstancedMesh(new SphereGeometry(0.11, 12, 8), new MeshBasicMaterial({ color: 0xffffff }), OUTDOOR_LAMPS.length);
    OUTDOOR_LAMPS.forEach((p, i) => {
      this.dummy.position.copy(p);
      this.dummy.updateMatrix();
      this.lampHeads.setMatrixAt(i, this.dummy.matrix);
      this.lampHeads.setColorAt(i, new Color(0, 0, 0));
    });
    this.group.add(this.lampHeads);

    /* ── floating rocks ────────────────────────────────────────────────── */
    const fr = new IcosahedronGeometry(1, 0);
    this.rocks = new InstancedMesh(fr, new MeshStandardMaterial({ color: '#6c5b4e', flatShading: true, roughness: 1 }), 9);
    for (let i = 0; i < 9; i++) {
      this.rockData.push({ r: 11 + R() * 4.5, a: R() * Math.PI * 2, y: -1.5 - R() * 4.5, s: 0.25 + R() * 0.55, sp: 0.02 + R() * 0.03 });
    }
    this.group.add(this.rocks);

    /* ── clouds: merged puffs, instanced ───────────────────────────────── */
    const puffs = [];
    for (let k = 0; k < 5; k++) {
      const g = new IcosahedronGeometry(0.5 + (k % 3) * 0.18, 1);
      g.translate((k - 2) * 0.55, Math.sin(k * 1.7) * 0.15 + (k === 2 ? 0.25 : 0), Math.cos(k * 2.3) * 0.25);
      puffs.push(g.index ? g.toNonIndexed() : g);
    }
    const cloudGeo = mergeGeometries(puffs)!;
    cloudGeo.computeVertexNormals();
    this.clouds = new InstancedMesh(
      cloudGeo,
      new MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, emissive: new Color('#9fb3d1'), emissiveIntensity: 0.12 }),
      16,
    );
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + R() * 0.3;
      const r = 15 + R() * 16;
      this.cloudData.push({ x: Math.cos(a) * r, y: -4.5 - R() * 7, z: Math.sin(a) * r, s: 0.9 + R() * 1.3, sp: 0.04 + R() * 0.05 });
    }
    this.group.add(this.clouds);
    this.update(0);
  }

  update(time: number) {
    const d = this.dummy;
    this.rockData.forEach((r, i) => {
      const a = r.a + time * r.sp;
      d.position.set(Math.cos(a) * r.r, r.y + Math.sin(time * 0.6 + i) * 0.25, Math.sin(a) * r.r);
      d.rotation.set(time * 0.1 + i, time * 0.07 + i * 2, 0);
      d.scale.setScalar(r.s);
      d.updateMatrix();
      this.rocks.setMatrixAt(i, d.matrix);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
    this.cloudData.forEach((c, i) => {
      const a = time * c.sp * 0.05;
      const x = c.x * Math.cos(a) - c.z * Math.sin(a);
      const z = c.x * Math.sin(a) + c.z * Math.cos(a);
      d.position.set(x, c.y + Math.sin(time * 0.3 + i) * 0.2, z);
      d.rotation.set(0, i, 0);
      d.scale.set(c.s * 1.4, c.s * 0.8, c.s);
      d.updateMatrix();
      this.clouds.setMatrixAt(i, d.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  setCloudTint(c: Color, intensity: number) {
    const m = this.clouds.material as MeshStandardMaterial;
    m.emissive.copy(c);
    m.emissiveIntensity = intensity;
  }

  private lampColor = new Color();
  setLampLevel(level: number) {
    const c = this.lampColor;
    for (let i = 0; i < OUTDOOR_LAMPS.length; i++) {
      const l = Math.max(0, Math.min(1, level * 1.4 - i * 0.12));
      c.setRGB(3.2 * l, 1.9 * l, 0.8 * l);
      this.lampHeads.setColorAt(i, c);
    }
    this.lampHeads.instanceColor!.needsUpdate = true;
  }
}
