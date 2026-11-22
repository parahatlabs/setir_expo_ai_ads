import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';
import { ATLAS_GLSL } from './textures';

/**
 * A set of camera-facing sprites drawn from the shared atlas in ONE draw call.
 * Per instance: position, size, two atlas cells + crossfade (e.g. red badge →
 * green check), opacity and an HDR tint (so they can bloom).
 */
export class Billboards {
  readonly mesh: InstancedMesh;
  private pos: Vector3[] = [];
  private size: number[] = [];
  private cellA: InstancedBufferAttribute;
  private cellB: InstancedBufferAttribute;
  private mixA: InstancedBufferAttribute;
  private alpha: InstancedBufferAttribute;
  private tint: InstancedBufferAttribute;
  private rot: InstancedBufferAttribute;

  constructor(readonly count: number, atlas: Texture, opts: { additive?: boolean; depthTest?: boolean; aspect?: number } = {}) {
    const g = new PlaneGeometry(opts.aspect ?? 1, 1);
    this.cellA = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.cellB = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.mixA = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.alpha = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.tint = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
    this.rot = new InstancedBufferAttribute(new Float32Array(count), 1);
    g.setAttribute('aCellA', this.cellA);
    g.setAttribute('aCellB', this.cellB);
    g.setAttribute('aMix', this.mixA);
    g.setAttribute('aAlpha', this.alpha);
    g.setAttribute('aTint', this.tint);
    g.setAttribute('aRot', this.rot);
    const mat = new ShaderMaterial({
      uniforms: { uMap: { value: atlas } },
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      vertexShader: /* glsl */ `
        attribute float aCellA; attribute float aCellB; attribute float aMix; attribute float aAlpha;
        attribute vec3 aTint; attribute float aRot;
        varying vec2 vUv; varying float vA; varying float vB; varying float vMix; varying float vAlpha; varying vec3 vTint;
        void main(){
          vUv = uv; vA = aCellA; vB = aCellB; vMix = aMix; vAlpha = aAlpha; vTint = aTint;
          vec4 c = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
          float s = length(instanceMatrix[0].xyz);
          float cr = cos(aRot), sr = sin(aRot);
          vec2 p = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
          c.xy += p * s;
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv; varying float vA; varying float vB; varying float vMix; varying float vAlpha; varying vec3 vTint;
        ${ATLAS_GLSL}
        void main(){
          vec4 a = texture2D(uMap, atlasUv(vA, vUv));
          vec4 b = texture2D(uMap, atlasUv(vB, vUv));
          vec4 c = mix(a, b, vMix);
          c.rgb *= vTint;
          c.a *= vAlpha;
          if (c.a < 0.004) discard;
          gl_FragColor = c;
          #include <colorspace_fragment>
        }`,
    });
    if (opts.additive) {
      mat.fragmentShader = mat.fragmentShader.replace('gl_FragColor = c;', 'gl_FragColor = vec4(c.rgb * c.a, 1.0);');
    }
    this.mesh = new InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      this.pos.push(new Vector3());
      this.size.push(0);
    }
  }

  set(i: number, p: Vector3, size: number, cellA: number, cellB = cellA, mix = 0, alpha = 1, rot = 0) {
    this.pos[i].copy(p);
    this.size[i] = size;
    this.cellA.setX(i, cellA);
    this.cellB.setX(i, cellB);
    this.mixA.setX(i, mix);
    this.alpha.setX(i, size <= 0.0001 ? 0 : alpha);
    this.rot.setX(i, rot);
  }
  setTint(i: number, c: Color, k = 1) {
    this.tint.setXYZ(i, c.r * k, c.g * k, c.b * k);
  }

  commit() {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const s = Math.max(1e-5, this.size[i]);
      const o = i * 16;
      arr.fill(0, o, o + 16);
      arr[o] = s;
      arr[o + 5] = s;
      arr[o + 10] = s;
      arr[o + 12] = this.pos[i].x;
      arr[o + 13] = this.pos[i].y;
      arr[o + 14] = this.pos[i].z;
      arr[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cellA.needsUpdate = true;
    this.cellB.needsUpdate = true;
    this.mixA.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.rot.needsUpdate = true;
  }
}
