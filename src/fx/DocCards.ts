import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';
import { ATLAS_GLSL, CELL_ID } from '../world/textures';
import { DESKS } from '../world/layout';
import { clamp, ease, hash, smooth } from '../core/math';
import { HASH } from './glsl';

const PER_DESK = 3;
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * Documents / spreadsheets / e-mails / PDFs that lift off the desks, hover,
 * then arc towards the Core while dissolving (noise dissolve with glowing
 * edge) — their "content" continues as the particle stream.
 */
export class DocCards {
  readonly mesh: InstancedMesh;
  private dissolve: InstancedBufferAttribute;
  private cell: InstancedBufferAttribute;
  private d = new Object3D();
  readonly count = DESKS.length * PER_DESK;

  constructor(atlas: Texture) {
    const g = new PlaneGeometry(0.3, 0.385);
    this.dissolve = new InstancedBufferAttribute(new Float32Array(this.count), 1);
    this.cell = new InstancedBufferAttribute(new Float32Array(this.count), 1);
    for (let i = 0; i < this.count; i++) this.cell.setX(i, CELL_ID.docs[i % CELL_ID.docs.length]);
    g.setAttribute('aDissolve', this.dissolve);
    g.setAttribute('aCell', this.cell);
    this.mesh = new InstancedMesh(
      g,
      new ShaderMaterial({
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { uMap: { value: atlas }, uGlow: { value: new Vector3(0.4, 1.6, 2.0) } },
        vertexShader: /* glsl */ `
          attribute float aDissolve; attribute float aCell;
          varying vec2 vUv; varying float vD; varying float vCell; varying float vId;
          void main(){ vUv = uv; vD = aDissolve; vCell = aCell; vId = float(gl_InstanceID);
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap; uniform vec3 uGlow;
          varying vec2 vUv; varying float vD; varying float vCell; varying float vId;
          ${ATLAS_GLSL}
          ${HASH}
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec4 c = texture2D(uMap, atlasUv(vCell, vUv));
            if (c.a < 0.05) discard;
            float n = vn(vUv * 9.0 + vId * 3.1) * 0.65 + vn(vUv * 23.0 + vId) * 0.35;
            float th = vD * 1.15 - 0.08;
            if (n < th) discard;
            float edge = 1.0 - smoothstep(0.0, 0.07, n - th);
            vec3 col = c.rgb * (0.9 + 0.25 * (1.0 - vD)) + uGlow * edge * step(0.001, vD) * 2.5;
            // faint digital rim
            float rim = smoothstep(0.42, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            col += uGlow * rim * 0.35;
            gl_FragColor = vec4(col, c.a);
          }`,
      }),
      this.count,
    );
    this.mesh.frustumCulled = false;
  }

  /**
   * @param p overall phase 0..1 of the card sequence (driven by the training scene)
   */
  update(p: number, time: number, core: Vector3) {
    const d = this.d;
    this.mesh.visible = p > 0.001 && p < 0.999;
    for (let i = 0; i < this.count; i++) {
      const desk = DESKS[Math.floor(i / PER_DESK)];
      const k = i % PER_DESK;
      const delay = (Math.floor(i / PER_DESK) * 0.06 + k * 0.1 + hash(i) * 0.05);
      const lp = clamp((p - delay) / 0.62); // local phase
      const lift = smooth(clamp(lp / 0.3));
      const fly = ease.inOutCubic(clamp((lp - 0.32) / 0.58));
      // start on the stack, lift to a hover point, then curve into the core
      _a.set(desk.stack.x + (k - 1) * 0.12, desk.stack.y + 0.3, desk.stack.z);
      _b.set(desk.x + (k - 1) * 0.42, 1.55 + k * 0.22 + hash(i + 3) * 0.2, desk.z + (desk.row ? -0.3 : 0.4));
      _c.copy(_a).lerp(_b, lift);
      if (fly > 0) {
        const mid = _a.copy(_b).lerp(core, 0.5);
        mid.y += 0.9;
        // quadratic bezier b → mid → core
        const u = fly;
        const x = (1 - u) * (1 - u) * _b.x + 2 * (1 - u) * u * mid.x + u * u * core.x;
        const y = (1 - u) * (1 - u) * _b.y + 2 * (1 - u) * u * mid.y + u * u * core.y;
        const z = (1 - u) * (1 - u) * _b.z + 2 * (1 - u) * u * mid.z + u * u * core.z;
        _c.set(x, y, z);
      }
      const bob = Math.sin(time * 1.8 + i) * 0.03 * lift * (1 - fly);
      d.position.set(_c.x, _c.y + bob, _c.z);
      d.rotation.set(-0.2 + Math.sin(time + i) * 0.15 * lift, time * 0.4 * lift + i * 1.3 + fly * 3, Math.sin(time * 0.7 + i) * 0.12);
      const s = lp <= 0 ? 0.0001 : (0.3 + 0.7 * lift) * (1 - fly * 0.6);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.dissolve.setX(i, clamp((fly - 0.15) / 0.75));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dissolve.needsUpdate = true;
  }
}
