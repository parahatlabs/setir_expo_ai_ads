import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { HASH, POINT_SPRITE, SIMPLEX3 } from './glsl';
import { CORE_POS } from '../world/layout';

/** Everything the story can ask of the Core in a given frame. */
export interface CoreState {
  appear: number; // 0 hidden … 1 visible
  pos: Vector3;
  scale: number;
  energy: number; // overall brightness
  accent: number; // 0 cyan … 1 brand accent
  warm: number; // 0 … 1 calm amber
  data: number; // data-pattern amount on the surface
  trail: number; // descending light streak
  rings: number; // orbital rings visibility
  halo: number; // extra halo boost (flashes)
  shock: number; // shockwave progress 0..1 (0 = none)
  absorb: number; // absorption pulse 0..1
}

export const newCoreState = (): CoreState => ({
  appear: 0,
  pos: CORE_POS.clone(),
  scale: 1,
  energy: 1,
  accent: 0,
  warm: 0,
  data: 0,
  trail: 0,
  rings: 0,
  halo: 0,
  shock: 0,
  absorb: 0,
});

const CYAN = new Color('#33eaff');
const CYAN_DEEP = new Color('#063b5c');
const AMBER = new Color('#ffb04d');
const AMBER_DEEP = new Color('#5a2a08');

/**
 * THE AI CORE — protagonist of the film.
 *  • shell: additive plasma sphere (simplex fbm veins + fresnel rim + a
 *    lat/long "data" cell pattern that appears as it learns)
 *  • hot inner core, billboard volumetric halo with soft rays
 *  • dashed orbital data rings + orbiting sparks
 *  • real point light (tints the office) + floor glow + landing shockwave
 */
export class AICore {
  readonly group = new Group();
  readonly light: PointLight;
  readonly color = new Color();
  private deep = new Color();
  private accent: Color;
  private accentDeep: Color;
  private shell: Mesh<SphereGeometry, ShaderMaterial>;
  private inner: Mesh<SphereGeometry, ShaderMaterial>;
  private halo: Mesh<PlaneGeometry, ShaderMaterial>;
  private rings: Mesh<TorusGeometry, ShaderMaterial>[] = [];
  private sparks: Points<BufferGeometry, ShaderMaterial>;
  private trail: Mesh<PlaneGeometry, ShaderMaterial>;
  private floorGlow: Mesh<PlaneGeometry, ShaderMaterial>;
  private shockRing: Mesh<RingGeometry, ShaderMaterial>;
  private body = new Group();

  constructor(accentHex: string, lowDetail = false) {
    this.accent = new Color(accentHex);
    this.accentDeep = this.accent.clone().multiplyScalar(0.18);

    /* shell */
    this.shell = new Mesh(
      new SphereGeometry(0.5, lowDetail ? 64 : 112, lowDetail ? 40 : 72),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color() },
          uDeep: { value: new Color() },
          uData: { value: 0 },
          uEnergy: { value: 1 },
          uAbsorb: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uAbsorb;
          varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec2 vUv;
          ${SIMPLEX3}
          void main(){
            vec3 p = position;
            float n = snoise(normalize(p) * 1.3 + vec3(0.0, uTime * 0.3, uTime * 0.2));
            p += normal * (n * 0.008 + uAbsorb * 0.01 * sin(uTime * 14.0 + p.y * 18.0));
            vP = position * 2.0; vUv = uv;
            vec4 w = modelMatrix * vec4(p, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform vec3 uDeep; uniform float uData; uniform float uEnergy;
          varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec2 vUv;
          ${SIMPLEX3}
          ${HASH}
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float ndv = max(dot(normalize(vN), V), 0.0);
            float fres = pow(1.0 - ndv, 2.2);
            // flowing plasma veins
            vec3 q = vP * 1.25 + vec3(0.0, -uTime * 0.28, uTime * 0.12);
            float f = fbm3(q);
            float veins = 1.0 - smoothstep(0.0, 0.075, abs(f));
            float f2 = fbm3(q * 2.1 + 4.0);
            float veins2 = 1.0 - smoothstep(0.0, 0.07, abs(f2));
            // data cells on a lat/long grid (appear while learning)
            vec2 g = vec2(vUv.x * 72.0, vUv.y * 36.0);
            vec2 cell = floor(g);
            vec2 fc = fract(g);
            float blink = hash21(cell + floor(uTime * 4.0 + hash21(cell) * 8.0));
            float bit = step(0.78, blink) * step(0.18, fc.x) * step(fc.x, 0.82) * step(0.28, fc.y) * step(fc.y, 0.72);
            float band = smoothstep(0.75, 1.0, sin(vUv.y * 18.0 - uTime * 2.6)) ;
            float lat = (1.0 - smoothstep(0.0, 0.06, abs(fract(vUv.y * 12.0) - 0.5) * 2.0 - 0.94));
            float poles = sin(vUv.y * 3.14159);
            float data = (bit * (0.55 + band * 1.6) + lat * 0.25) * poles * uData;
            vec3 col = uDeep * (0.45 + 0.55 * ndv)
                     + uColor * veins * (0.9 + 0.6 * sin(uTime * 1.3 + f * 6.0))
                     + uColor * veins2 * 0.35
                     + uColor * data * 1.6
                     + mix(uColor, vec3(1.0), 0.3) * fres * 1.9;
            float a = 0.55 + fres * 0.45;
            gl_FragColor = vec4(col * uEnergy * a * 0.8, 1.0);
          }`,
      }),
    );

    /* hot inner core */
    this.inner = new Mesh(
      new SphereGeometry(0.15, 32, 20),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: new Color() }, uEnergy: { value: 1 } },
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
          void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uEnergy; varying vec3 vN; varying vec3 vW;
          void main(){ float ndv = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0);
            vec3 c = mix(uColor, vec3(1.0), 0.55) * (1.4 + 3.6 * pow(ndv, 3.0));
            gl_FragColor = vec4(c * uEnergy, 1.0); }`,
      }),
    );

    /* volumetric halo (camera-facing) */
    this.halo = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new Color() }, uSize: { value: 5 }, uIntensity: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uSize; varying vec2 vUv;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
          ${SIMPLEX3}
          void main(){
            vec2 d = vUv - 0.5; float r = length(d) * 2.0; float ang = atan(d.y, d.x);
            float core = exp(-r * r * 14.0) * 0.7;
            float glow = exp(-r * 3.2) * 0.42;
            float rays = smoothstep(0.1, 0.9, snoise(vec3(cos(ang) * 1.6, sin(ang) * 1.6, uTime * 0.18)) * 0.5 + 0.5);
            rays *= exp(-r * 2.4) * (1.0 - smoothstep(0.6, 1.0, r)) * 0.35;
            float a = (core + glow + rays) * (1.0 - smoothstep(0.85, 1.0, r));
            gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
          }`,
      }),
    );
    this.halo.frustumCulled = false;

    /* orbital rings */
    const ringGeo = new TorusGeometry(0.95, 0.006, 6, 220);
    for (let i = 0; i < 3; i++) {
      const r = new Mesh(
        ringGeo,
        new ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: { uTime: { value: 0 }, uColor: { value: new Color() }, uAmount: { value: 0 }, uSeed: { value: i * 1.7 } },
          vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: /* glsl */ `
            uniform float uTime; uniform vec3 uColor; uniform float uAmount; uniform float uSeed; varying vec2 vUv;
            void main(){
              float x = vUv.x * (24.0 + uSeed * 8.0) - uTime * (0.6 + uSeed * 0.3);
              float dash = step(0.35, fract(x)) * (0.4 + 0.6 * step(0.8, fract(x * 0.25 + uSeed)));
              float reveal = step(vUv.x, uAmount);
              gl_FragColor = vec4(uColor * (0.6 + dash * 2.4) * reveal, 1.0);
            }`,
        }),
      );
      r.rotation.set(Math.PI / 2 + (i - 1) * 0.55, i * 1.1, 0);
      r.scale.setScalar(1 + i * 0.22);
      this.rings.push(r);
    }

    /* orbiting sparks */
    const N = 260;
    const sg = new BufferGeometry();
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seeds[i] = Math.random();
    sg.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    this.sparks = new Points(
      sg,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new Color() }, uScale: { value: 400 }, uAmount: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed; uniform float uTime; uniform float uScale; uniform float uAmount; varying float vA;
          void main(){
            float r = 0.7 + aSeed.x * 1.3;
            float a = aSeed.y * 6.2832 + uTime * (0.25 + aSeed.z * 0.6) * (aSeed.w > 0.5 ? 1.0 : -1.0);
            float inc = (aSeed.w - 0.5) * 2.2;
            vec3 p = vec3(cos(a) * r, sin(a * 1.3 + aSeed.x * 6.0) * 0.25 + sin(inc) * sin(a) * r * 0.5, sin(a) * r * cos(inc));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = uAmount * (0.4 + 0.6 * sin(uTime * 3.0 + aSeed.x * 40.0) * 0.5 + 0.3);
            gl_PointSize = uScale * (0.012 + aSeed.z * 0.018) / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vA; ${POINT_SPRITE}
          void main(){ gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4) * 3.0 * pointMask() * vA, 1.0); }`,
      }),
    );
    this.sparks.frustumCulled = false;

    /* descending light streak */
    const tg = new PlaneGeometry(0.16, 1, 1, 1);
    tg.translate(0, 0.5, 0);
    this.trail = new Mesh(
      tg,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uColor: { value: new Color() }, uAmount: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uAmount; varying vec2 vUv;
          void main(){ float x = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = pow(x, 3.0) * pow(1.0 - vUv.y, 2.2);
            gl_FragColor = vec4(mix(uColor, vec3(1.0), x * 0.6) * a * uAmount * 4.0, 1.0); }`,
      }),
    );
    this.trail.frustumCulled = false;

    /* floor glow + shockwave (world space, not scaled with the core) */
    this.floorGlow = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: new Color() }, uI: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uI; varying vec2 vUv;
          void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)); gl_FragColor = vec4(uColor * a * uI, 1.0); }`,
      }),
    );
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.set(CORE_POS.x, 0.04, CORE_POS.z);
    this.floorGlow.scale.setScalar(6);

    this.shockRing = new Mesh(
      new RingGeometry(0.0, 1, 96, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uColor: { value: new Color() }, uP: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uP; varying vec2 vP;
          void main(){ float r = length(vP); float w = 0.035 + uP * 0.05; float ring = exp(-pow((r - 0.97) / w, 2.0));
            float inner = smoothstep(0.0, 0.97, r) * 0.18;
            float a = (ring * 2.5 + inner) * (1.0 - uP) * (1.0 - uP);
            gl_FragColor = vec4(mix(uColor, vec3(1.0), ring * 0.4) * a, 1.0); }`,
      }),
    );
    this.shockRing.rotation.x = -Math.PI / 2;
    this.shockRing.visible = false;

    this.light = new PointLight(0x33eaff, 0, 0, 2);

    this.body.add(this.shell, this.inner, ...this.rings, this.sparks);
    this.group.add(this.body, this.halo, this.trail, this.light);
  }

  /** Objects that live in world space (add to the scene root). */
  get worldObjects() {
    return [this.floorGlow, this.shockRing];
  }

  setSparkScale(drawingBufferHeight: number, cam: PerspectiveCamera) {
    this.sparks.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan((cam.fov * Math.PI) / 360));
  }

  update(s: CoreState, time: number, cam: PerspectiveCamera) {
    const vis = s.appear;
    this.group.visible = vis > 0.001;
    this.floorGlow.visible = vis > 0.001;
    // colour journey: cyan → brand accent → warm amber
    this.color.copy(CYAN).lerp(this.accent, s.accent).lerp(AMBER, s.warm);
    this.deep.copy(CYAN_DEEP).lerp(this.accentDeep, s.accent).lerp(AMBER_DEEP, s.warm);

    this.group.position.copy(s.pos);
    const breathe = 1 + Math.sin(time * 2.1) * 0.025 + s.absorb * 0.06 * Math.sin(time * 14);
    const sc = Math.max(0.0001, s.scale * vis * breathe);
    this.body.scale.setScalar(sc);
    this.body.rotation.y = time * 0.25;

    const e = s.energy * vis;
    const su = this.shell.material.uniforms;
    su.uTime.value = time;
    su.uColor.value.copy(this.color);
    su.uDeep.value.copy(this.deep);
    su.uData.value = s.data;
    su.uEnergy.value = e;
    su.uAbsorb.value = s.absorb;
    this.inner.material.uniforms.uColor.value.copy(this.color);
    this.inner.material.uniforms.uEnergy.value = e;

    const hu = this.halo.material.uniforms;
    hu.uTime.value = time;
    hu.uColor.value.copy(this.color);
    hu.uSize.value = (1.9 + s.scale * 2.0) * vis + s.halo * 3.5;
    hu.uIntensity.value = (0.38 + s.halo * 1.4 + s.absorb * 0.3) * Math.min(1, e);

    this.rings.forEach((r, i) => {
      const u = r.material.uniforms;
      u.uTime.value = time;
      u.uColor.value.copy(this.color);
      u.uAmount.value = s.rings;
      r.visible = s.rings > 0.001;
      r.rotation.z = time * (0.2 + i * 0.13) * (i % 2 ? -1 : 1);
    });
    const spu = this.sparks.material.uniforms;
    spu.uTime.value = time;
    spu.uColor.value.copy(this.color);
    spu.uAmount.value = s.rings * vis;

    // trail faces the camera around the vertical axis
    this.trail.visible = s.trail > 0.001;
    this.trail.material.uniforms.uAmount.value = s.trail;
    this.trail.material.uniforms.uColor.value.copy(this.color);
    this.trail.scale.set(1, 1.2 + s.trail * 3.2, 1);
    this.trail.rotation.y = Math.atan2(cam.position.x - s.pos.x, cam.position.z - s.pos.z);

    this.light.color.copy(this.color);
    this.light.intensity = e * (3.2 + s.scale * 3.6) + s.halo * 14;

    // floor glow strongest when the core hovers low
    const fg = this.floorGlow.material.uniforms;
    fg.uColor.value.copy(this.color);
    fg.uI.value = e * 0.55 * Math.max(0, 1 - (s.pos.y - 1.5) / 6) * (0.6 + s.scale * 0.4);
    this.floorGlow.position.set(s.pos.x, 0.045, s.pos.z);

    const shockOn = s.shock > 0.001 && s.shock < 0.999;
    this.shockRing.visible = shockOn;
    if (shockOn) {
      const r = 0.4 + s.shock * 9.0;
      this.shockRing.scale.set(r, r, 1);
      this.shockRing.position.set(s.pos.x, 0.06, s.pos.z);
      this.shockRing.material.uniforms.uP.value = s.shock;
      this.shockRing.material.uniforms.uColor.value.copy(this.color);
    }
  }
}
