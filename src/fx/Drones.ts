import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  type Texture,
} from 'three';
import { Billboards } from '../world/Billboards';
import { CELL_ID } from '../world/textures';
import { DESKS } from '../world/layout';
import { clamp, ease } from '../core/math';

export interface DroneState {
  launch: number; // 0..1 flight from core to its desk
  work: number; // 0..1 working at the desk
  ret: number; // 0..1 flying back into the core
}
export const newDroneState = (): DroneState => ({ launch: 0, work: 0, ret: 0 });

const _p = new Vector3();
const _q = new Vector3();
const _w = new Color(1, 1, 1);

/**
 * AGENT DRONES — the Core splits into six small agents (mail, report, chat,
 * invoice, calendar, database). Each flies to a desk, scans its work with a
 * light cone, then returns. Body, ring, cone, icon and glow are 5 draw calls.
 */
export class Drones {
  readonly group = new Group();
  private body: InstancedMesh;
  private ring: InstancedMesh;
  private cone: InstancedMesh;
  private coneI: InstancedBufferAttribute;
  private icons: Billboards;
  private glows: Billboards;
  private d = new Object3D();
  readonly positions: Vector3[] = DESKS.map(() => new Vector3());
  private accent: Color;

  constructor(atlas: Texture, accentHex: string) {
    this.accent = new Color(accentHex);
    const n = DESKS.length;
    this.body = new InstancedMesh(
      new IcosahedronGeometry(0.1, 1),
      new MeshStandardMaterial({ color: '#1a1f26', roughness: 0.25, metalness: 0.5, flatShading: true }),
      n,
    );
    this.body.castShadow = true;
    this.ring = new InstancedMesh(new TorusGeometry(0.16, 0.014, 6, 40), new MeshBasicMaterial({ color: new Color(this.accent).multiplyScalar(3) }), n);
    const cg = new ConeGeometry(0.42, 1, 24, 1, true);
    cg.translate(0, -0.5, 0);
    this.coneI = new InstancedBufferAttribute(new Float32Array(n), 1);
    cg.setAttribute('aI', this.coneI);
    this.cone = new InstancedMesh(
      cg,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: new Color(this.accent) }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `attribute float aI; varying float vI; varying vec2 vUv;
          void main(){ vI = aI; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying float vI; varying vec2 vUv;
          void main(){ float fall = pow(vUv.y, 1.6); float scan = 0.6 + 0.4 * step(0.5, fract(vUv.y * 8.0 + uTime * 3.0));
            gl_FragColor = vec4(uColor * fall * scan * vI * 0.9, 1.0); }`,
      }),
      n,
    );
    for (const m of [this.body, this.ring, this.cone]) m.frustumCulled = false;
    this.icons = new Billboards(n, atlas);
    this.glows = new Billboards(n, atlas, { additive: true });
    this.group.add(this.cone, this.body, this.ring, this.glows.mesh, this.icons.mesh);
  }

  update(states: DroneState[], core: Vector3, time: number) {
    const d = this.d;
    let any = false;
    states.forEach((s, i) => {
      const desk = DESKS[i];
      const hover = desk.hover;
      const out = s.launch > 0 && s.ret < 1;
      any = any || out;
      // flight core → hover (arched, eased), then back
      const fl = ease.inOutCubic(clamp(s.launch));
      const rt = ease.inOutCubic(clamp(s.ret));
      const arcFrom = (from: Vector3, to: Vector3, u: number, lift: number, outV: Vector3) => {
        outV.copy(from).lerp(to, u);
        outV.y += Math.sin(u * Math.PI) * lift;
        return outV;
      };
      arcFrom(core, hover, fl, 1.1 + (i % 3) * 0.25, _p);
      if (rt > 0) {
        _q.copy(hover);
        arcFrom(_q, core, rt, 0.9, _p);
      }
      const working = s.work > 0 && s.work < 1 && rt === 0;
      const bob = Math.sin(time * 3 + i * 1.3) * 0.04 * (fl * (1 - rt));
      _p.y += bob - (working ? Math.sin(Math.min(1, s.work * 3) * Math.PI * 0.5) * 0.08 : 0);
      this.positions[i].copy(_p);
      const size = out ? clamp(s.launch * 4) * (1 - clamp((s.ret - 0.75) * 4)) : 0;

      d.position.copy(_p);
      d.rotation.set(0, time * 1.5 + i, 0);
      d.scale.setScalar(Math.max(1e-4, size));
      d.updateMatrix();
      this.body.setMatrixAt(i, d.matrix);
      d.rotation.set(Math.PI / 2 + Math.sin(time * 2 + i) * 0.25, 0, time * 4 + i);
      d.updateMatrix();
      this.ring.setMatrixAt(i, d.matrix);

      // scanning cone towards the paper stack while working
      const coneAmt = working ? Math.sin(clamp(s.work) * Math.PI) : 0;
      d.position.copy(_p);
      d.rotation.set(0, time * 2, 0);
      const h = Math.max(0.01, _p.y - desk.stack.y);
      d.scale.set(coneAmt > 0.01 ? 0.7 : 1e-4, h, coneAmt > 0.01 ? 0.7 : 1e-4);
      d.updateMatrix();
      this.cone.setMatrixAt(i, d.matrix);
      this.coneI.setX(i, coneAmt);

      _q.copy(_p);
      _q.y += 0.3;
      this.icons.set(i, _q, 0.36 * size, CELL_ID.agentIcons[i]);
      this.glows.set(i, _p, 0.9 * size, CELL_ID.glow, CELL_ID.glow, 0, 0.9);
      this.glows.setTint(i, this.accent, 1.6 + coneAmt * 1.2);
    });
    this.group.visible = any;
    for (const m of [this.body, this.ring, this.cone]) m.instanceMatrix.needsUpdate = true;
    this.coneI.needsUpdate = true;
    (this.cone.material as ShaderMaterial).uniforms.uTime.value = time;
    this.icons.commit();
    this.glows.commit();
    void _w;
  }
}
