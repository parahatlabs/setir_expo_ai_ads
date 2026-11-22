import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { Track, type Key } from '../core/math';
import { S } from '../core/timeline';
import type { Stage } from './Stage';
import { POINT_SPRITE } from '../fx/glsl';

/**
 * Lighting + colour grading per moment of the film ("the colour journey"):
 * cold grey-blue chaos → dark night → teal energy → neutral dawn → bright
 * morning → warm amber sunset. Keys are authored as readable hex colours and
 * blended smoothly.
 */
interface Mood {
  t: number;
  skyTop: string;
  skyHor: string;
  skyBot: string;
  sun: string;
  sunI: number;
  sunAz: number;
  sunEl: number;
  hemi: string;
  hemiG: string;
  hemiI: number;
  env: number;
  stars: number;
  exposure: number;
  sat: number;
  con: number;
  tint: string;
  lift: string;
  vig: number;
  bloom: number;
  fog: number;
  /** outdoor lamp posts */
  lamps: number;
}

const BASE: Omit<Mood, 't'> = {
  skyTop: '#141d2e', skyHor: '#56657d', skyBot: '#1c2433',
  sun: '#a9bedb', sunI: 1.25, sunAz: -2.3, sunEl: 0.62,
  hemi: '#8ea3bf', hemiG: '#2e3238', hemiI: 0.62, env: 0.2, stars: 0.18,
  exposure: 0.92, sat: 0.62, con: 1.1, tint: '#dfe8ff', lift: '#060d1a', vig: 0.62, bloom: 1.0, fog: 0.011, lamps: 0.35,
};

const moods: Mood[] = [
  { t: S(0, 0), ...BASE },
  { t: S(0, 11), ...BASE, sunI: 1.0, hemiI: 0.55, sat: 0.58, skyTop: '#111827', skyHor: '#4a5870' },
  // the scene darkens
  { t: S(1, 2.5), ...BASE, skyTop: '#060a12', skyHor: '#172131', skyBot: '#080c14', sunI: 0.22, hemiI: 0.32, env: 0.1, stars: 1, exposure: 0.95, sat: 0.62, tint: '#cfe0ff', bloom: 1.1, lamps: 0.1 },
  { t: S(1, 8), ...BASE, skyTop: '#05101a', skyHor: '#13303c', skyBot: '#071018', sunI: 0.22, hemiI: 0.34, env: 0.12, stars: 0.9, exposure: 1.0, sat: 0.9, tint: '#d4f6ff', lift: '#021014', bloom: 1.15, lamps: 0.05 },
  // training: teal energy
  { t: S(2, 4), ...BASE, skyTop: '#04111a', skyHor: '#0e3340', skyBot: '#061018', sunI: 0.25, hemiI: 0.3, hemi: '#6fbfd0', hemiG: '#1c2328', env: 0.12, stars: 0.75, exposure: 0.98, sat: 0.95, con: 1.1, tint: '#e2f8ff', lift: '#000c12', bloom: 1.15, lamps: 0.05 },
  { t: S(2, 12), ...BASE, skyTop: '#05101a', skyHor: '#163640', skyBot: '#071016', sunI: 0.28, hemiI: 0.32, hemi: '#7fc4d0', hemiG: '#1c2328', env: 0.12, stars: 0.6, exposure: 0.98, sat: 0.95, con: 1.1, tint: '#eef8ff', lift: '#000a10', bloom: 1.15, lamps: 0.05 },
  // security: pre-dawn exterior, readable
  { t: S(3, 2), ...BASE, skyTop: '#0b1f33', skyHor: '#41708a', skyBot: '#0e1d2b', sun: '#bcd6ff', sunI: 1.1, sunEl: 0.7, hemi: '#a9c8e6', hemiI: 0.85, env: 0.22, stars: 0.3, exposure: 1.02, sat: 0.95, con: 1.05, tint: '#eef6ff', lift: '#040c14', bloom: 1.2, lamps: 0.3 },
  { t: S(3, 13), ...BASE, skyTop: '#16334f', skyHor: '#7aa4bc', skyBot: '#1a2e40', sun: '#dfe9ff', sunI: 1.6, sunEl: 0.75, hemi: '#bcd6ee', hemiI: 1.0, env: 0.3, stars: 0.1, exposure: 1.02, sat: 0.98, con: 1.04, tint: '#f6faff', lift: '#02070c', bloom: 1.1, lamps: 0.15 },
  // agents: bright clear morning
  { t: S(4, 3), ...BASE, skyTop: '#2b5a80', skyHor: '#b4d4e2', skyBot: '#2c4a5e', sun: '#fff1dc', sunI: 2.5, sunAz: -2.0, sunEl: 0.85, hemi: '#d4eaff', hemiG: '#4a4a42', hemiI: 0.8, env: 0.3, stars: 0, exposure: 0.9, sat: 1.08, con: 1.12, tint: '#ffffff', lift: '#000000', vig: 0.45, bloom: 1.0, fog: 0.006, lamps: 0 },
  { t: S(4, 13), ...BASE, skyTop: '#2f5d82', skyHor: '#c9dbe0', skyBot: '#2c4a5e', sun: '#fff0d8', sunI: 2.6, sunAz: -2.1, sunEl: 0.7, hemi: '#e0eeff', hemiG: '#4e4a40', hemiI: 0.82, env: 0.3, stars: 0, exposure: 0.9, sat: 1.1, con: 1.12, tint: '#fffdf8', lift: '#000000', vig: 0.45, bloom: 1.0, fog: 0.008, lamps: 0 },
  // calm: warm golden hour, long shadows through the windows
  { t: S(5, 3), ...BASE, skyTop: '#3a4170', skyHor: '#ffb06a', skyBot: '#5a3a48', sun: '#ffb068', sunI: 3.4, sunAz: -2.45, sunEl: 0.26, hemi: '#ffd4a6', hemiG: '#5b4636', hemiI: 0.95, env: 0.35, stars: 0, exposure: 1.02, sat: 1.1, con: 1.05, tint: '#fff0dc', lift: '#140a06', vig: 0.55, bloom: 1.15, fog: 0.01, lamps: 0.4 },
  { t: S(5, 13), ...BASE, skyTop: '#2c2f5c', skyHor: '#ff9a5c', skyBot: '#4a2e40', sun: '#ff9f5a', sunI: 2.8, sunAz: -2.5, sunEl: 0.16, hemi: '#ffc896', hemiG: '#4b3a30', hemiI: 0.85, env: 0.3, stars: 0.15, exposure: 1.0, sat: 1.1, con: 1.05, tint: '#ffe9d4', lift: '#140a08', vig: 0.62, bloom: 1.15, fog: 0.011, lamps: 1 },
];

const COLOR_KEYS = ['skyTop', 'skyHor', 'skyBot', 'sun', 'hemi', 'hemiG', 'tint', 'lift'] as const;
const NUM_KEYS = ['sunI', 'sunAz', 'sunEl', 'hemiI', 'env', 'stars', 'exposure', 'sat', 'con', 'vig', 'bloom', 'fog', 'lamps'] as const;
const _c = new Color();

function toVec(m: Mood): number[] {
  const v: number[] = [];
  for (const k of COLOR_KEYS) {
    _c.set(m[k]); // stored linear
    v.push(_c.r, _c.g, _c.b);
  }
  for (const k of NUM_KEYS) v.push(m[k]);
  return v;
}

export class Atmosphere {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private sky: Mesh<SphereGeometry, ShaderMaterial>;
  private stars: Points<BufferGeometry, ShaderMaterial>;
  private track: Track;
  private v: number[];
  readonly fog: FogExp2;
  /** Current values other systems read (lamp posts, cloud tint…). */
  lamps = 0;
  readonly horizon = new Color();
  private tmp = new Color();

  constructor(private stage: Stage) {
    const keys: Key[] = moods.map((m) => ({ t: m.t, v: toVec(m) }));
    this.track = new Track(keys, 'smooth');
    this.v = new Array(keys[0].v.length).fill(0);

    this.sun = new DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.mapSize.set(stage.quality.shadowMapSize, stage.quality.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 4;
    this.hemi = new HemisphereLight(0xffffff, 0x444444, 1);
    stage.scene.add(this.sun, this.sun.target, this.hemi);

    this.fog = new FogExp2(0x6f7f96, 0.01);
    stage.scene.fog = this.fog;

    this.sky = new Mesh(
      new SphereGeometry(180, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new Color() }, uHor: { value: new Color() }, uBot: { value: new Color() } },
        vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; varying vec3 vD;
          void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.75, y), 0.7)) : mix(uHor, uBot, smoothstep(0.0, -0.45, y));
            // subtle horizon glow band
            c += uHor * exp(-abs(y) * 14.0) * 0.18;
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;

    const N = 1400;
    const pos = new Float32Array(N * 3);
    const sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.03;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 150;
      pos[i * 3 + 1] = y * 150;
      pos[i * 3 + 2] = Math.sin(a) * r * 150;
      sz[i] = Math.random();
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(pos, 3));
    sg.setAttribute('aS', new BufferAttribute(sz, 1));
    this.stars = new Points(
      sg,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uPR: { value: 1 } },
        vertexShader: /* glsl */ `attribute float aS; uniform float uTime; uniform float uPR; varying float vA;
          void main(){ vA = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (0.5 + aS * 2.0) + aS * 50.0)); vA *= 0.35 + aS * 0.65;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; gl_PointSize = (1.0 + aS * 2.2) * uPR; }`,
        fragmentShader: /* glsl */ `uniform float uA; varying float vA; ${POINT_SPRITE}
          void main(){ gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * pointMask() * vA * uA * 1.6, 1.0); }`,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    stage.scene.add(this.sky, this.stars);
  }

  setShadowMapSize(n: number) {
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  update(t: number, time: number) {
    const v = this.track.eval(t, this.v);
    let o = 0;
    const col = (target: Color) => {
      target.setRGB(v[o], v[o + 1], v[o + 2]);
      o += 3;
      return target;
    };
    const su = this.sky.material.uniforms;
    col(su.uTop.value);
    col(su.uHor.value);
    col(su.uBot.value);
    this.horizon.copy(su.uHor.value);
    col(this.sun.color);
    col(this.hemi.color);
    col(this.hemi.groundColor);
    const g = this.stage.grade;
    col(this.tmp);
    (g.u('tint').value as { set: (x: number, y: number, z: number) => void }).set(this.tmp.r, this.tmp.g, this.tmp.b);
    col(this.tmp);
    // lift is stored linear; grade applies it in sqrt space → convert back
    (g.u('lift').value as { set: (x: number, y: number, z: number) => void }).set(Math.sqrt(this.tmp.r), Math.sqrt(this.tmp.g), Math.sqrt(this.tmp.b));
    const sunI = v[o], az = v[o + 1], el = v[o + 2], hemiI = v[o + 3], env = v[o + 4], stars = v[o + 5];
    const exposure = v[o + 6], sat = v[o + 7], con = v[o + 8], vig = v[o + 9], bloom = v[o + 10], fog = v[o + 11], lamps = v[o + 12];
    this.sun.intensity = sunI;
    const ce = Math.cos(el);
    this.sun.position.set(Math.sin(az) * ce * 25, Math.sin(el) * 25, Math.cos(az) * ce * 25);
    this.sun.target.position.set(0, 0, 0);
    this.hemi.intensity = hemiI;
    this.stage.scene.environmentIntensity = env;
    this.stars.material.uniforms.uA.value = stars;
    this.stars.material.uniforms.uTime.value = time;
    this.stars.material.uniforms.uPR.value = this.stage.pixelRatio;
    const tint = g.u('tint').value as { multiplyScalar: (n: number) => void };
    tint.multiplyScalar(exposure);
    g.u('saturation').value = sat;
    g.u('contrast').value = con;
    g.u('vignette').value = vig;
    this.stage.bloom.intensity = bloom;
    this.fog.color.copy(this.horizon);
    this.fog.density = fog;
    this.lamps = lamps;
  }
}
