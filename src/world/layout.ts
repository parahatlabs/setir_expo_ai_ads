import { Vector3 } from 'three';

/**
 * Shared spatial layout of the diorama. All scenes, models and effects read
 * positions from here, so the office can be rearranged in one place.
 * Units ≈ metres. Office floor top is y = 0, centred on the origin.
 */

export const OFFICE = { minX: -5, maxX: 5, minZ: -3.5, maxZ: 3.5, wallH: 2.8, wallT: 0.2 };
export const DOOR = { x: -5, z: 2.15, w: 1.05, h: 2.1 };

export const DESK_H = 0.76;
const DESK_X = [-3.1, 0, 3.1];
const ROW_Z = [-1.55, 1.75];

export interface DeskSpot {
  index: number;
  x: number;
  z: number;
  /** Hip position of the seated worker. */
  seat: Vector3;
  /** Centre of the monitor screen. */
  monitor: Vector3;
  /** Base of the paper stack. */
  stack: Vector3;
  /** Floating notification badge. */
  badge: Vector3;
  /** Desk lamp head. */
  lamp: Vector3;
  /** Where the agent drone hovers while working. */
  hover: Vector3;
  /** Task card position. */
  card: Vector3;
  row: 0 | 1;
}

export const DESKS: DeskSpot[] = [];
ROW_Z.forEach((z, row) => {
  DESK_X.forEach((x) => {
    const i = DESKS.length;
    DESKS.push({
      index: i,
      x,
      z,
      seat: new Vector3(x, 0.5, z + 0.68),
      monitor: new Vector3(x, DESK_H + 0.33, z - 0.2),
      stack: new Vector3(x + 0.5, DESK_H + 0.005, z + 0.06),
      badge: new Vector3(x - 0.05, DESK_H + 0.86, z - 0.22),
      lamp: new Vector3(x - 0.56, DESK_H + 0.44, z - 0.12),
      hover: new Vector3(x + 0.5, DESK_H + 0.95, z + 0.06),
      card: new Vector3(x + 0.42, DESK_H + 0.78, z - 0.12),
      row: row as 0 | 1,
    });
  });
});

export const CORE_POS = new Vector3(0, 1.78, 0.15);
export const CLOCK_POS = new Vector3(-1.0, 2.0, OFFICE.minZ + OFFICE.wallT + 0.02);
export const TV_POS = new Vector3(1.05, 1.92, OFFICE.minZ + OFFICE.wallT + 0.03);
export const ANTENNA_POS = new Vector3(4.25, 3.75, -3.15);
export const CLOUD_POS = new Vector3(8.2, 9.2, -8.0);
export const DOME_RADIUS = 7.2;

/** Exit walk for each worker in the calm scene (polyline, floor level). */
export function exitPath(d: DeskSpot): Vector3[] {
  const aisleZ = d.row === 0 ? 0.35 : 3.05;
  return [
    new Vector3(d.seat.x, 0, d.seat.z),
    new Vector3(d.seat.x, 0, aisleZ),
    new Vector3(-4.25, 0, aisleZ),
    new Vector3(-4.25, 0, DOOR.z),
    new Vector3(-5.6, 0, DOOR.z),
    new Vector3(-6.6, 0, DOOR.z + 0.9),
    new Vector3(-7.25, 0, DOOR.z + 2.0),
  ];
}
