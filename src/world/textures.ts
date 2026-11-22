import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';

/**
 * One procedurally drawn texture atlas (8 × 5 cells of 256 px) for every flat
 * graphic in the 3D world: badges, document cards, agent icons, task cards.
 * Drawn once at startup with Canvas2D — no image files.
 */

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 5;
const CELL = 256;

export const CELL_ID = {
  badge: [0, 1, 2, 3, 4, 5] as const, // red badges with growing numbers
  badgeAlert: 6,
  badgeCheck: 7,
  docs: [8, 9, 10, 11, 12] as const, // text, sheet, mail, pdf, chart
  glow: 13,
  ring: 14,
  lock: 15,
  agentIcons: [16, 17, 18, 19, 20, 21] as const, // mail, report, chat, invoice, calendar, database
  cloud: 22,
  spark: 23,
  task: [24, 25, 26, 27, 28, 29] as const,
  taskDone: [32, 33, 34, 35, 36, 37] as const,
};

const RED = '#ff3b4a';
const GREEN = '#35e08a';
const INK = '#141a22';

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ── glyphs, drawn centred on (0,0) in a ~120 px box ─────────────────────── */
const glyph: Record<string, (c: Ctx) => void> = {
  mail(c) {
    rr(c, -54, -38, 108, 76, 10);
    c.stroke();
    c.beginPath();
    c.moveTo(-50, -32);
    c.lineTo(0, 8);
    c.lineTo(50, -32);
    c.stroke();
  },
  report(c) {
    rr(c, -44, -54, 88, 108, 10);
    c.stroke();
    c.fillRect(-26, 8, 12, 28);
    c.fillRect(-6, -8, 12, 44);
    c.fillRect(14, -24, 12, 60);
  },
  chat(c) {
    rr(c, -56, -46, 112, 74, 18);
    c.stroke();
    c.beginPath();
    c.moveTo(-26, 28);
    c.lineTo(-34, 50);
    c.lineTo(-6, 28);
    c.stroke();
    for (const x of [-26, 0, 26]) {
      c.beginPath();
      c.arc(x, -9, 7, 0, Math.PI * 2);
      c.fill();
    }
  },
  invoice(c) {
    c.beginPath();
    c.moveTo(-40, -54);
    c.lineTo(40, -54);
    c.lineTo(40, 54);
    for (let i = 0; i < 4; i++) {
      c.lineTo(30 - i * 20, 44);
      c.lineTo(20 - i * 20, 54);
    }
    c.lineTo(-40, 44);
    c.closePath();
    c.stroke();
    c.fillRect(-24, -32, 48, 8);
    c.fillRect(-24, -14, 30, 8);
    c.beginPath();
    c.arc(8, 20, 14, 0, Math.PI * 2);
    c.stroke();
  },
  calendar(c) {
    rr(c, -52, -42, 104, 92, 12);
    c.stroke();
    c.fillRect(-52, -42, 104, 22);
    c.fillRect(-32, -56, 10, 24);
    c.fillRect(22, -56, 10, 24);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) c.fillRect(-34 + k * 26, -6 + r * 24, 16, 14);
  },
  database(c) {
    for (const y of [-32, 0, 32]) {
      c.beginPath();
      c.ellipse(0, y - 6, 46, 14, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-46, -38);
    c.lineTo(-46, 26);
    c.moveTo(46, -38);
    c.lineTo(46, 26);
    c.stroke();
    c.beginPath();
    c.ellipse(0, 26, 46, 14, 0, 0, Math.PI);
    c.stroke();
  },
  check(c) {
    c.beginPath();
    c.moveTo(-34, 2);
    c.lineTo(-10, 26);
    c.lineTo(36, -24);
    c.stroke();
  },
  lock(c) {
    rr(c, -40, -8, 80, 62, 12);
    c.fill();
    c.beginPath();
    c.arc(0, -10, 28, Math.PI, 0);
    c.stroke();
  },
  cloud(c) {
    c.beginPath();
    c.arc(-30, 10, 26, 0, Math.PI * 2);
    c.arc(4, -10, 34, 0, Math.PI * 2);
    c.arc(36, 12, 24, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-30, 10, 66, 26);
  },
};
const ICON_ORDER = ['mail', 'report', 'chat', 'invoice', 'calendar', 'database'];

export function createAtlas(accent: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * ATLAS_COLS;
  canvas.height = CELL * ATLAS_ROWS;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, canvas.width, canvas.height);

  const at = (id: number, fn: (c: Ctx) => void) => {
    c.save();
    c.translate((id % ATLAS_COLS) * CELL + CELL / 2, Math.floor(id / ATLAS_COLS) * CELL + CELL / 2);
    fn(c);
    c.restore();
  };

  // Row 0 — notification badges
  const nums = ['3', '8', '14', '27', '56', '99+'];
  nums.forEach((n, i) =>
    at(CELL_ID.badge[i], (c) => {
      badgeDisc(c, RED);
      c.fillStyle = '#fff';
      c.font = `800 ${n.length > 2 ? 64 : 84}px Manrope, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(n, 0, 6);
    }),
  );
  at(CELL_ID.badgeAlert, (c) => {
    badgeDisc(c, RED);
    c.fillStyle = '#fff';
    c.fillRect(-9, -50, 18, 62);
    c.beginPath();
    c.arc(0, 38, 11, 0, Math.PI * 2);
    c.fill();
  });
  at(CELL_ID.badgeCheck, (c) => {
    badgeDisc(c, GREEN);
    c.strokeStyle = '#fff';
    c.lineWidth = 18;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    glyph.check(c);
  });

  // Row 1 — documents that get "learned"
  const docColors = ['#3f7bff', '#1fae6a', '#f2a93b', '#ff4d5e', '#9a6bff'];
  CELL_ID.docs.forEach((id, i) =>
    at(id, (c) => {
      c.shadowColor = 'rgba(0,0,0,0.25)';
      c.shadowBlur = 10;
      rr(c, -92, -118, 184, 236, 14);
      c.fillStyle = '#f7f5f0';
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = docColors[i];
      rr(c, -92, -118, 184, 34, 14);
      c.fill();
      c.fillRect(-92, -100, 184, 16);
      c.fillStyle = '#c9ccd3';
      if (i === 1) {
        // spreadsheet grid
        c.strokeStyle = '#b4bac4';
        c.lineWidth = 3;
        for (let r = 0; r < 7; r++) {
          c.beginPath();
          c.moveTo(-72, -60 + r * 22);
          c.lineTo(72, -60 + r * 22);
          c.stroke();
        }
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.moveTo(-72 + k * 48, -60);
          c.lineTo(-72 + k * 48, 72);
          c.stroke();
        }
        c.fillStyle = docColors[1];
        c.fillRect(-70, -38, 44, 18);
        c.fillRect(-22, 6, 44, 18);
      } else if (i === 4) {
        c.fillStyle = docColors[4];
        [40, 70, 50, 95, 80].forEach((h, k) => c.fillRect(-70 + k * 30, 80 - h, 20, h));
        c.fillStyle = '#c9ccd3';
        c.fillRect(-72, 86, 144, 6);
      } else {
        if (i === 2) {
          c.strokeStyle = docColors[2];
          c.lineWidth = 7;
          c.save();
          c.translate(0, -44);
          c.scale(0.5, 0.5);
          glyph.mail(c);
          c.restore();
        }
        if (i === 3) {
          c.fillStyle = docColors[3];
          c.font = '800 40px Manrope, sans-serif';
          c.textAlign = 'center';
          c.fillText('PDF', 0, -36);
          c.fillStyle = '#c9ccd3';
        }
        const start = i === 0 ? -64 : -6;
        for (let r = 0; start + r * 20 < 96; r++) {
          const w = 144 - ((r * 37) % 60);
          c.fillRect(-72, start + r * 20, w, 9);
        }
      }
    }),
  );
  at(CELL_ID.glow, (c) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 126);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-128, -128, 256, 256);
  });
  at(CELL_ID.ring, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(0, 0, 100, 0, Math.PI * 2);
    c.stroke();
  });
  at(CELL_ID.lock, (c) => {
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineWidth = 14;
    glyph.lock(c);
  });

  // Row 2 — agent icons (glyph on accent disc with soft glow)
  ICON_ORDER.forEach((name, i) =>
    at(CELL_ID.agentIcons[i], (c) => {
      const g = c.createRadialGradient(0, 0, 60, 0, 0, 126);
      g.addColorStop(0, hexA(accent, 0.55));
      g.addColorStop(1, hexA(accent, 0));
      c.fillStyle = g;
      c.fillRect(-128, -128, 256, 256);
      c.beginPath();
      c.arc(0, 0, 86, 0, Math.PI * 2);
      c.fillStyle = accent;
      c.fill();
      c.strokeStyle = INK;
      c.fillStyle = INK;
      c.lineWidth = 11;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.scale(0.86, 0.86);
      glyph[name](c);
    }),
  );
  at(CELL_ID.cloud, (c) => {
    c.fillStyle = '#fff';
    glyph.cloud(c);
  });
  at(CELL_ID.spark, (c) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 120);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.08, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-128, -128, 256, 256);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(-120, -2, 240, 4);
    c.fillRect(-2, -120, 4, 240);
  });

  // Rows 3/4 — task cards (open / done)
  ICON_ORDER.forEach((name, i) => {
    for (const done of [false, true]) {
      at(done ? CELL_ID.taskDone[i] : CELL_ID.task[i], (c) => {
        c.shadowColor = 'rgba(0,0,0,0.3)';
        c.shadowBlur = 12;
        rr(c, -116, -66, 232, 132, 22);
        c.fillStyle = '#f8f7f3';
        c.fill();
        c.shadowBlur = 0;
        c.beginPath();
        c.arc(-66, 0, 36, 0, Math.PI * 2);
        c.fillStyle = accent;
        c.fill();
        c.save();
        c.translate(-66, 0);
        c.scale(0.34, 0.34);
        c.strokeStyle = INK;
        c.fillStyle = INK;
        c.lineWidth = 12;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        glyph[name](c);
        c.restore();
        c.fillStyle = '#c4c8cf';
        rr(c, -18, -26, 92, 14, 7);
        c.fill();
        rr(c, -18, 2, 62, 12, 6);
        c.fill();
        if (done) {
          c.beginPath();
          c.arc(80, 30, 30, 0, Math.PI * 2);
          c.fillStyle = GREEN;
          c.fill();
          c.save();
          c.translate(80, 30);
          c.scale(0.5, 0.5);
          c.strokeStyle = '#fff';
          c.lineWidth = 18;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          glyph.check(c);
          c.restore();
        }
      });
    }
  });

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function badgeDisc(c: Ctx, color: string) {
  c.shadowColor = color;
  c.shadowBlur = 24;
  c.beginPath();
  c.arc(0, 0, 92, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.shadowBlur = 0;
  c.lineWidth = 8;
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.stroke();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** UV rect (offsetX, offsetY, scaleX, scaleY) of an atlas cell — flipY aware. */
export function cellRect(id: number): [number, number, number, number] {
  const col = id % ATLAS_COLS;
  const row = Math.floor(id / ATLAS_COLS);
  return [col / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS];
}

/** GLSL helper: atlas uv from cell index (matches cellRect). */
export const ATLAS_GLSL = /* glsl */ `
  vec2 atlasUv(float cell, vec2 uv) {
    float col = mod(cell, ${ATLAS_COLS.toFixed(1)});
    float row = floor(cell / ${ATLAS_COLS.toFixed(1)});
    vec2 inset = uv * 0.98 + 0.01;
    return vec2((col + inset.x) / ${ATLAS_COLS.toFixed(1)}, 1.0 - (row + 1.0 - inset.y) / ${ATLAS_ROWS.toFixed(1)});
  }
`;
