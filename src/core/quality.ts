/**
 * Quality tiers + automatic fallback.
 *  1. Initial guess from GPU string / device class (or ?quality=low|medium|high).
 *  2. Runtime governor: if the average frame rate stays low, first lower the
 *     render resolution step by step, then drop a whole tier. Never upgrades
 *     (avoids oscillation on a booth that runs for hours).
 */

export type Tier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: Tier;
  /** Max rendered pixels (w×h×dpr²). 4K TVs get upscaled from this budget. */
  maxPixels: number;
  msaa: number;
  shadows: boolean;
  shadowMapSize: number;
  tiltShift: boolean;
  bloomLevels: number;
  /** Fraction of the GPU particle pools that is drawn. */
  particleScale: number;
  grain: boolean;
}

export const TIERS: Record<Tier, QualitySettings> = {
  high: {
    tier: 'high',
    maxPixels: 3840 * 2160 * 0.62, // ≈ 1.24× 1440p
    msaa: 4,
    shadows: true,
    shadowMapSize: 2048,
    tiltShift: true,
    bloomLevels: 8,
    particleScale: 1,
    grain: true,
  },
  medium: {
    tier: 'medium',
    maxPixels: 1920 * 1080 * 1.05,
    msaa: 2,
    shadows: true,
    shadowMapSize: 1024,
    tiltShift: true,
    bloomLevels: 6,
    particleScale: 0.55,
    grain: true,
  },
  low: {
    tier: 'low',
    maxPixels: 1280 * 720 * 1.1,
    msaa: 0,
    shadows: false,
    shadowMapSize: 512,
    tiltShift: false,
    bloomLevels: 5,
    particleScale: 0.28,
    grain: false,
  },
};

export function detectTier(gl: WebGL2RenderingContext | null): { tier: Tier; gpu: string } {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality') as Tier | null;
  let gpu = 'unknown';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }
  if (forced && forced in TIERS) return { tier: forced, gpu };

  const g = gpu.toLowerCase();
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return { tier: 'low', gpu };
  if (mobile) return { tier: mem <= 4 || /mali|adreno \(tm\) [3-5]|powervr/.test(g) ? 'low' : 'medium', gpu };
  if (/intel.*(hd|uhd) graphics [0-9]{3}\b|intel\(r\) hd/.test(g)) return { tier: 'medium', gpu };
  return { tier: 'high', gpu };
}

/** Watches frame times and asks the stage to degrade if the device can't keep up. */
export class FrameGovernor {
  private acc = 0;
  private frames = 0;
  private warmup = 3.5;
  private lowStreak = 0;
  renderScale = 1;
  fps = 60;

  constructor(private onDegrade: (kind: 'scale' | 'tier') => void, private enabled = true) {}

  /** Call every frame with the real delta (seconds). */
  tick(dt: number) {
    if (dt > 0.25) return; // tab was hidden / long GC — ignore
    this.acc += dt;
    this.frames++;
    if (this.acc < 1) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (!this.enabled) return;
    if (this.warmup > 0) {
      this.warmup -= 1;
      return;
    }
    if (this.fps < 47) this.lowStreak++;
    else this.lowStreak = Math.max(0, this.lowStreak - 1);
    if (this.lowStreak >= 3) {
      this.lowStreak = 0;
      this.warmup = 2; // let the change settle
      if (this.renderScale > 0.71) {
        this.renderScale = Math.max(0.7, this.renderScale - 0.15);
        this.onDegrade('scale');
      } else {
        this.renderScale = 1;
        this.onDegrade('tier');
      }
    }
  }
}
