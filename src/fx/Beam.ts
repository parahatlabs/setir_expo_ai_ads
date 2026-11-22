import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANTENNA_POS, CLOUD_POS } from '../world/layout';
import { LAYER_B } from '../render/Stage';
import { Billboards } from '../world/Billboards';
import { CELL_ID } from '../world/textures';

const SEG = 96;
const _p = new Vector3();
const _white = new Color(1, 1, 1);
const UP = new Vector3(0, 0.45, 0);

/** Point on the (slightly arched) link between the building and the cloud node. */
export function beamPoint(s: number, out: Vector3) {
  out.copy(ANTENNA_POS).lerp(CLOUD_POS, s);
  out.y += Math.sin(s * Math.PI) * 1.2;
  return out;
}

/**
 * CLOUD AGENTS — a single thin, encrypted light beam from the rooftop antenna
 * to a glowing cloud node, with packets travelling both ways and a lock
 * marker at the building end. Only visible in split view B.
 */
export class Beam {
  readonly group = new Group();
  private ribbon: Mesh<BufferGeometry, ShaderMaterial>;
  private packets: InstancedMesh;
  private cloud: Mesh;
  private cloudCore: Mesh;
  private cloudRing: Mesh;
  private icons: Billboards;
  private d = new Object3D();

  constructor(atlas: Texture) {
    // ribbon geometry: 2 verts per segment
    const g = new BufferGeometry();
    const s = new Float32Array((SEG + 1) * 2);
    const side = new Float32Array((SEG + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      s[i * 2] = s[i * 2 + 1] = i / SEG;
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < SEG) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    g.setAttribute('aS', new BufferAttribute(s, 1));
    g.setAttribute('aSide', new BufferAttribute(side, 1));
    g.setIndex(idx);
    this.ribbon = new Mesh(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: {
          uA: { value: ANTENNA_POS.clone() },
          uB: { value: CLOUD_POS.clone() },
          uTime: { value: 0 },
          uReveal: { value: 0 },
          uColor: { value: new Color() },
          uWidth: { value: 0.16 },
        },
        vertexShader: /* glsl */ `
          attribute float aS; attribute float aSide;
          uniform vec3 uA; uniform vec3 uB; uniform float uWidth;
          varying float vS; varying float vSide;
          void main(){
            vS = aS; vSide = aSide;
            vec3 p = mix(uA, uB, aS); p.y += sin(aS * 3.14159) * 1.2;
            vec3 p2 = mix(uA, uB, aS + 0.01); p2.y += sin((aS + 0.01) * 3.14159) * 1.2;
            vec3 tang = normalize(p2 - p);
            vec3 toCam = normalize(cameraPosition - p);
            vec3 sd = normalize(cross(tang, toCam));
            p += sd * aSide * uWidth;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uReveal; uniform vec3 uColor;
          varying float vS; varying float vSide;
          void main(){
            if (vS > uReveal) discard;
            float x = abs(vSide);
            float core = exp(-x * x * 140.0);
            float glow = exp(-x * x * 9.0) * 0.35;
            float enc = step(0.55, fract(vS * 60.0 - uTime * 1.4)) * step(x, 0.35) * 0.8;
            float head = exp(-pow((uReveal - vS) * 30.0, 2.0)) * step(uReveal, 0.995);
            vec3 c = uColor * (glow + enc * 0.6) + mix(uColor, vec3(1.0), 0.6) * (core * 2.4 + head * 4.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.ribbon.frustumCulled = false;

    // packets
    this.packets = new InstancedMesh(new OctahedronGeometry(0.075, 0), new MeshBasicMaterial({ color: 0xffffff }), 18);
    this.packets.frustumCulled = false;

    // cloud node
    const puffs = [];
    const pp: [number, number, number, number][] = [[0, 0, 0, 1.35], [-1.25, -0.3, 0.2, 1.0], [1.3, -0.25, -0.1, 1.05], [0.5, 0.7, 0.1, 0.95], [-0.55, 0.6, -0.2, 0.85], [0, -0.35, 0.75, 0.85]];
    for (const [x, y, z, r] of pp) {
      const ge = new IcosahedronGeometry(r, 1);
      ge.translate(x, y, z);
      puffs.push(ge.index ? ge.toNonIndexed() : ge);
    }
    const cg = mergeGeometries(puffs)!;
    cg.computeVertexNormals();
    this.cloud = new Mesh(cg, new MeshStandardMaterial({ color: '#eef6ff', roughness: 0.6, flatShading: true, emissive: new Color('#3ad7ff'), emissiveIntensity: 0.25 }));
    this.cloud.position.copy(CLOUD_POS);
    this.cloudCore = new Mesh(new SphereGeometry(0.32, 24, 16), new MeshBasicMaterial({ color: new Color(3, 6, 7) }));
    this.cloudCore.position.copy(CLOUD_POS).add(new Vector3(0, -0.15, 1.3));
    this.cloudRing = new Mesh(new TorusGeometry(2.5, 0.025, 6, 120), new MeshBasicMaterial({ color: new Color(1, 3, 4) }));
    this.cloudRing.position.copy(CLOUD_POS);

    // lock markers along the link (plain glyph, no logos)
    this.icons = new Billboards(3, atlas);
    this.group.add(this.ribbon, this.packets, this.cloud, this.cloudCore, this.cloudRing, this.icons.mesh);
    this.group.traverse((o) => o.layers.set(LAYER_B));
  }

  update(reveal: number, alpha: number, time: number, color: Color) {
    const vis = reveal > 0.001 && alpha > 0.001;
    this.group.visible = vis;
    if (!vis) return;
    const u = this.ribbon.material.uniforms;
    u.uTime.value = time;
    u.uReveal.value = reveal;
    u.uColor.value.copy(color).multiplyScalar(alpha);

    const pc = this.packets.material as MeshBasicMaterial;
    pc.color.copy(color).lerp(_white, 0.3).multiplyScalar(3.5 * alpha);
    const n = this.packets.count;
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0;
      let s = (time * 0.16 + i / n) % 1;
      if (!up) s = 1 - s;
      const ok = s < reveal - 0.02;
      beamPoint(s, _p);
      this.d.position.copy(_p);
      this.d.rotation.set(time * 2 + i, time * 3 + i, 0);
      this.d.scale.setScalar(ok ? (up ? 1 : 0.7) : 0.0001);
      this.d.updateMatrix();
      this.packets.setMatrixAt(i, this.d.matrix);
    }
    this.packets.instanceMatrix.needsUpdate = true;

    const cloudIn = Math.max(0, Math.min(1, (reveal - 0.75) / 0.25));
    const cs = 0.0001 + cloudIn;
    this.cloud.scale.setScalar(cs * (1 + Math.sin(time * 1.2) * 0.02));
    this.cloud.position.set(CLOUD_POS.x, CLOUD_POS.y + Math.sin(time * 0.8) * 0.15, CLOUD_POS.z);
    (this.cloud.material as MeshStandardMaterial).emissive.copy(color);
    this.cloudCore.scale.setScalar(cs);
    (this.cloudCore.material as MeshBasicMaterial).color.copy(color).multiplyScalar(5 * alpha);
    this.cloudRing.scale.setScalar(cs);
    this.cloudRing.rotation.set(Math.PI / 2 + Math.sin(time * 0.5) * 0.2, 0, time * 0.4);
    (this.cloudRing.material as MeshBasicMaterial).color.copy(color).multiplyScalar(2.5 * alpha);

    // lock icons: at the antenna, at the middle of the link and at the cloud
    const lockIn = Math.min(1, reveal * 3);
    this.icons.set(0, beamPoint(0.02, _p).add(UP), 0.5 * lockIn, CELL_ID.lock, CELL_ID.lock, 0, alpha);
    this.icons.set(1, beamPoint(0.5, _p).add(UP), 0.45 * Math.max(0, Math.min(1, (reveal - 0.5) * 6)), CELL_ID.lock, CELL_ID.lock, 0, alpha);
    this.icons.set(2, beamPoint(0.98, _p), 0.0001, CELL_ID.lock);
    this.icons.setTint(0, color, 2.2);
    this.icons.setTint(1, color, 2.2);
    this.icons.commit();
  }
}
