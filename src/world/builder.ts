import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural "toy model" builder.
 * Accumulates many primitive parts — each with its own vertex colour and a
 * soft bottom-darkening (fake ambient occlusion) — and merges them into ONE
 * geometry. The whole static office becomes a single draw call.
 */

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

export interface PartOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** Brightness at the bottom of the part (fake AO). 1 = none. */
  ao?: number;
}

export class ToyBuilder {
  private parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, color: ColorRepresentation, x: number, y: number, z: number, o: PartOpts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _p.set(x, y, z);
    // fake AO computed in local space before transforming
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    _c.set(color);
    const ao = o.ao ?? 0.78;
    const h = Math.max(1e-4, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) - bb.min.y) / h;
      const f = ao + (1 - ao) * Math.min(1, k * 1.6);
      col[i * 3] = _c.r * f;
      col[i * 3 + 1] = _c.g * f;
      col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.applyMatrix4(_m.compose(_p, _q, _s));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: ColorRepresentation, x: number, y: number, z: number, o?: PartOpts) {
    return this.add(new BoxGeometry(w, h, d), color, x, y, z, o);
  }

  /** Box positioned by its bottom centre (handy for furniture). */
  boxB(w: number, h: number, d: number, color: ColorRepresentation, x: number, y: number, z: number, o?: PartOpts) {
    return this.box(w, h, d, color, x, y + h / 2, z, o);
  }

  cyl(rt: number, rb: number, h: number, seg: number, color: ColorRepresentation, x: number, y: number, z: number, o?: PartOpts) {
    return this.add(new CylinderGeometry(rt, rb, h, seg), color, x, y, z, o);
  }

  blob(r: number, detail: number, color: ColorRepresentation, x: number, y: number, z: number, o?: PartOpts) {
    return this.add(new IcosahedronGeometry(r, detail), color, x, y, z, { ao: 0.7, ...o });
  }

  build(): BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Shared material for all vertex-coloured toy geometry. */
export function toyMaterial(opts: { rough?: number } = {}) {
  return new MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.rough ?? 0.82,
    metalness: 0,
    flatShading: true,
  });
}
