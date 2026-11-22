import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { DESKS } from './layout';
import { clamp, rng } from '../core/math';

export const SHEETS_PER_DESK = 18;
const SHEET_T = 0.016;

/**
 * Paper stacks (one InstancedMesh for every sheet in the office).
 * `fill` = how many sheets are on the stack (0..1 of max).
 * `absorb` > 0 → sheets above the fill level fly up into the hovering agent
 * instead of dropping in, so the same function works for growth and cleanup.
 */
export class Papers {
  readonly mesh: InstancedMesh;
  private jitter: { x: number; z: number; r: number; tilt: number }[] = [];
  private d = new Object3D();

  constructor() {
    const R = rng(23);
    const n = DESKS.length * SHEETS_PER_DESK;
    this.mesh = new InstancedMesh(
      new BoxGeometry(0.3, SHEET_T * 0.8, 0.4),
      new MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      n,
    );
    const c = new Color();
    const tints = ['#fbfaf6', '#f6f2e8', '#eef3fb', '#fdf6d8', '#fbfaf6', '#f2efe9'];
    for (let i = 0; i < n; i++) {
      this.jitter.push({ x: (R() - 0.5) * 0.05, z: (R() - 0.5) * 0.05, r: (R() - 0.5) * 0.35, tilt: (R() - 0.5) * 0.04 });
      this.mesh.setColorAt(i, c.set(tints[Math.floor(R() * tints.length)]));
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(fill: number[], absorb: number[], time: number) {
    const d = this.d;
    DESKS.forEach((desk, di) => {
      const level = fill[di] * SHEETS_PER_DESK;
      const ab = absorb[di];
      for (let k = 0; k < SHEETS_PER_DESK; k++) {
        const idx = di * SHEETS_PER_DESK + k;
        const j = this.jitter[idx];
        const over = k + 1 - level; // >0 → this sheet is (partly) not on the stack
        let y = desk.stack.y + k * SHEET_T + SHEET_T * 0.5;
        let x = desk.stack.x + j.x;
        let z = desk.stack.z + j.z;
        let s = 1;
        let spin = j.r;
        if (over > 0) {
          if (ab > 0) {
            // fly up to the agent and shrink
            const f = clamp(over / 2.2);
            const e = f * f * (3 - 2 * f);
            x += (desk.hover.x - x) * e;
            y += (desk.hover.y - 0.1 - y) * e;
            z += (desk.hover.z - z) * e;
            s = 1 - e;
            spin += e * 5;
          } else {
            // drop in from above
            const f = clamp(over);
            y += f * 0.35;
            s = 1 - f;
          }
        }
        // overloaded stacks wobble a little
        const wob = fill[di] > 0.75 ? Math.sin(time * 3 + di) * 0.012 * (fill[di] - 0.75) * k : 0;
        d.position.set(x + wob, y, z);
        d.rotation.set(j.tilt, spin, j.tilt * 0.5);
        d.scale.setScalar(Math.max(0.0001, s));
        d.updateMatrix();
        this.mesh.setMatrixAt(idx, d.matrix);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
