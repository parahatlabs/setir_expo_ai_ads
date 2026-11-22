import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import { POINT_SPRITE, SIMPLEX3 } from './glsl';
import { DESKS } from '../world/layout';

/**
 * Training stream: thousands of GPU particles flowing along curved Bézier
 * paths from every desk into the AI Core. Positions are computed entirely in
 * the vertex shader from per-particle seeds + time — zero CPU cost per frame.
 */
export class DataStream {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  readonly max: number;

  constructor(count: number) {
    this.max = count;
    const g = new BufferGeometry();
    const start = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const d = DESKS[i % DESKS.length];
      // emit from the paper stack / monitor area of each desk
      const fromStack = Math.random() < 0.55;
      const p = fromStack ? d.stack : d.monitor;
      start[i * 3] = p.x + (Math.random() - 0.5) * (fromStack ? 0.3 : 0.55);
      start[i * 3 + 1] = p.y + Math.random() * (fromStack ? 0.3 : 0.2);
      start[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = Math.random();
    }
    g.setAttribute('position', new BufferAttribute(start, 3));
    g.setAttribute('aSeed', new BufferAttribute(seed, 4));
    g.boundingSphere = null;
    this.points = new Points(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: 0 },
          uCore: { value: new Vector3() },
          uColA: { value: new Color('#5ff3ff') },
          uColB: { value: new Color('#ffffff') },
          uScale: { value: 500 },
          uSize: { value: 0.028 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime; uniform float uFlow; uniform vec3 uCore; uniform float uScale; uniform float uSize;
          varying float vA; varying float vT;
          ${SIMPLEX3}
          void main(){
            float isOn = step(aSeed.z, uFlow);
            float speed = 0.16 + aSeed.x * 0.16;
            float t = fract(uTime * speed + aSeed.y);
            vec3 a = position;
            vec3 b = uCore;
            vec3 dir = b - a;
            vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + 1e-4);
            vec3 c1 = a + vec3(0.0, 0.9 + aSeed.w * 1.4, 0.0) + side * (aSeed.x - 0.5) * 1.8;
            vec3 c2 = b + vec3(0.0, 1.2 + aSeed.x * 1.1, 0.0) - side * (aSeed.w - 0.5) * 1.6;
            float it = 1.0 - t;
            vec3 p = it*it*it*a + 3.0*it*it*t*c1 + 3.0*it*t*t*c2 + t*t*t*b;
            // turbulent wobble, fading as the particle reaches the core
            float n = snoise(p * 1.3 + vec3(uTime * 0.4, 0.0, aSeed.x * 10.0));
            p += vec3(n, snoise(p.zyx * 1.1 + uTime * 0.3), -n) * 0.12 * (1.0 - t);
            // spiral in at the end
            float ang = t * 18.0 + aSeed.y * 6.2832;
            float sr = 0.22 * smoothstep(0.6, 0.85, t) * (1.0 - smoothstep(0.85, 0.97, t));
            p += vec3(cos(ang), sin(ang * 0.7) * 0.3, sin(ang)) * sr;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = isOn * smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.72, 0.9, t)) * (0.5 + aSeed.w * 0.5);
            vT = t;
            gl_PointSize = isOn * uScale * uSize * (0.5 + aSeed.x) * (1.0 - 0.6 * t) / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColA; uniform vec3 uColB; varying float vA; varying float vT;
          ${POINT_SPRITE}
          void main(){
            float m = pointMask();
            vec3 c = mix(uColA, uColB, smoothstep(0.55, 1.0, vT));
            gl_FragColor = vec4(c * m * vA * 1.5, 1.0);
          }`,
      }),
    );
    this.points.frustumCulled = false;
  }

  setDrawFraction(f: number) {
    this.points.geometry.setDrawRange(0, Math.floor(this.max * f));
  }

  update(flow: number, time: number, core: Vector3, colA: Color, colB: Color) {
    const u = this.points.material.uniforms;
    this.points.visible = flow > 0.001;
    u.uFlow.value = flow;
    u.uTime.value = time;
    u.uCore.value.copy(core);
    u.uColA.value.copy(colA);
    u.uColB.value.copy(colB);
  }
  setScale(s: number) {
    this.points.material.uniforms.uScale.value = s;
  }
}
