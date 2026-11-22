import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { HASH, POINT_SPRITE } from './glsl';
import { CORE_POS, DOME_RADIUS } from '../world/layout';
import { LAYER_A } from '../render/Stage';

/**
 * LOCAL AI — a glass shield dome rises around the building. Data particles
 * fly outward from the core, hit the dome (with a flash) and bounce back in:
 * your data never leaves the building. Only visible in split view A.
 */
export class Dome {
  readonly group = new Group();
  private dome: Mesh<SphereGeometry, ShaderMaterial>;
  private parts: Points<BufferGeometry, ShaderMaterial>;
  readonly max: number;

  constructor(count: number) {
    this.max = count;
    this.dome = new Mesh(
      new SphereGeometry(DOME_RADIUS, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uColor: { value: new Color() }, uAlpha: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vW; varying vec3 vN; varying vec3 vL;
          void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uReveal; uniform vec3 uColor; uniform float uAlpha;
          varying vec3 vW; varying vec3 vN; varying vec3 vL;
          ${HASH}
          // hexagon grid distance
          vec4 hexCoords(vec2 uv){
            vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
            vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
            vec2 gv = dot(a,a) < dot(b,b) ? a : b;
            float x = 0.5 - max(abs(gv.x) * 0.5 + abs(gv.y) * 0.8660254, abs(gv.x));
            return vec4(x, 0.0, uv - gv);
          }
          void main(){
            float R = ${DOME_RADIUS.toFixed(2)};
            float h = vL.y / R;                     // 0 at ground … 1 at top
            float front = uReveal * 1.08;
            if (h > front) discard;
            vec3 V = normalize(cameraPosition - vW);
            float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
            float lon = atan(vL.z, vL.x);
            vec2 uv = vec2(lon * 6.0, h * 9.0);
            vec4 hx = hexCoords(uv * 1.4);
            float edge = 1.0 - smoothstep(0.0, 0.06, hx.x);
            float cellFlash = step(0.93, hash21(hx.zw + floor(uTime * 2.0))) * 0.8;
            float scan = smoothstep(0.96, 1.0, sin(h * 30.0 - uTime * 3.0));
            float rim = 1.0 - smoothstep(0.0, 0.035, front - h);  // bright closing edge
            float ground = 1.0 - smoothstep(0.0, 0.05, h);
            vec3 c = uColor * (0.06 + fres * 0.8 + edge * 0.35 + cellFlash * 0.25 + scan * 0.25) + mix(uColor, vec3(1.0), 0.5) * (rim * 3.0 + ground * 0.9);
            gl_FragColor = vec4(c * uAlpha, 1.0);
          }`,
      }),
    );
    this.dome.position.set(0, -0.02, 0.1);
    this.dome.layers.set(LAYER_A);

    // bouncing particles
    const g = new BufferGeometry();
    const dirs = new Float32Array(count * 3);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      // random direction on the upper hemisphere, biased sideways
      const a = Math.random() * Math.PI * 2;
      const y = 0.05 + Math.random() * 0.85;
      const r = Math.sqrt(1 - y * y);
      dirs[i * 3] = Math.cos(a) * r;
      dirs[i * 3 + 1] = y;
      dirs[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 2] = Math.random();
      seed[i * 2 + 1] = Math.random();
    }
    g.setAttribute('position', new BufferAttribute(dirs, 3));
    g.setAttribute('aSeed', new BufferAttribute(seed, 2));
    this.parts = new Points(
      g,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uAmount: { value: 0 },
          uColor: { value: new Color() },
          uScale: { value: 500 },
          uOrigin: { value: CORE_POS.clone() },
        },
        vertexShader: /* glsl */ `
          attribute vec2 aSeed; uniform float uTime; uniform float uAmount; uniform float uScale; uniform vec3 uOrigin;
          varying float vA; varying float vHit;
          void main(){
            float R = ${(DOME_RADIUS * 0.985).toFixed(3)};
            vec3 d = normalize(position);
            float t = fract(uTime * (0.22 + aSeed.x * 0.18) + aSeed.y);
            vec3 o = uOrigin + vec3((aSeed.x - 0.5) * 2.0, -0.6 * aSeed.y, (aSeed.y - 0.5) * 1.5);
            // distance from o along d to the dome sphere (centred at origin)
            float b = dot(o, d); float c = dot(o, o) - R * R;
            float L = -b + sqrt(max(b * b - c, 0.0));
            vec3 hit = o + d * L;
            vec3 n = normalize(hit);
            vec3 refl = reflect(d, n);
            vec3 p = t < 0.5 ? mix(o, hit, t * 2.0) : hit + refl * (t - 0.5) * 2.0 * L * 0.6;
            vHit = exp(-abs(t - 0.5) * 30.0);
            vA = uAmount * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.85, 1.0, t));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uScale * (0.035 + vHit * 0.14) / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vA; varying float vHit; ${POINT_SPRITE}
          void main(){ gl_FragColor = vec4(mix(uColor, vec3(1.0), vHit * 0.7) * pointMask() * vA * (1.6 + vHit * 4.0), 1.0); }`,
      }),
    );
    this.parts.frustumCulled = false;
    this.parts.layers.set(LAYER_A);
    this.group.add(this.dome, this.parts);
  }

  setDrawFraction(f: number) {
    this.parts.geometry.setDrawRange(0, Math.floor(this.max * f));
  }
  setScale(s: number) {
    this.parts.material.uniforms.uScale.value = s;
  }

  update(reveal: number, bounce: number, time: number, color: Color, origin: Vector3) {
    this.group.visible = reveal > 0.001;
    const u = this.dome.material.uniforms;
    u.uTime.value = time;
    u.uReveal.value = reveal;
    u.uColor.value.copy(color);
    u.uAlpha.value = Math.min(1, reveal * 4);
    const p = this.parts.material.uniforms;
    p.uTime.value = time;
    p.uAmount.value = bounce;
    p.uColor.value.copy(color);
    p.uOrigin.value.copy(origin);
    this.parts.visible = bounce > 0.001;
  }
}
