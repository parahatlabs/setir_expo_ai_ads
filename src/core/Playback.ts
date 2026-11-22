import Lenis from 'lenis';
import { config } from '../config';
import { FILM_DURATION, SCENES } from './timeline';
import { clamp, damp } from './math';

export type Mode = 'scroll' | 'auto' | 'fixed';

/**
 * PLAYBACK DRIVERS — decide how the master film time `t` moves.
 *  • scroll: Lenis smooth scroll → t (plus extra damping for buttery camera)
 *  • auto (kiosk): t advances in real time, holds on the final screen, fades
 *    to black and loops forever. Any touch / wheel / key hands control to the
 *    visitor (scroll mode); after N seconds idle, autoplay resumes.
 *  • fixed: ?t=SECONDS freezes the film (screenshots / debugging).
 */
export class Playback {
  readonly lenis: Lenis;
  mode: Mode = 'scroll';
  kiosk = false;
  t = 0;
  fade = 0;
  private target = 0;
  private holdTimer = 0;
  private fadePhase: 'none' | 'out' | 'in' = 'none';
  private lastInput = performance.now();
  private suppressScrollSync = 0;
  onLoop?: () => void;
  onModeChange?: () => void;

  constructor(spacer: HTMLElement, private reduced: boolean) {
    spacer.style.height = `${config.scrollLengthVh}vh`;
    this.lenis = new Lenis({
      autoRaf: false,
      lerp: reduced ? 1 : 0.075,
      smoothWheel: !reduced,
      wheelMultiplier: 0.85,
      touchMultiplier: 1.35,
    });
    const onInput = () => this.userInput();
    window.addEventListener('wheel', onInput, { passive: true });
    window.addEventListener('touchstart', onInput, { passive: true });
    window.addEventListener('pointerdown', onInput, { passive: true });
    window.addEventListener('keydown', onInput);

    const params = new URLSearchParams(location.search);
    const fixed = params.get('t');
    if (fixed !== null) {
      this.mode = 'fixed';
      this.t = this.target = clamp(parseFloat(fixed) || 0, 0, FILM_DURATION);
    }
  }

  setKiosk(on: boolean) {
    this.kiosk = on;
    if (this.mode === 'fixed') return;
    if (on) {
      this.mode = 'auto';
    } else {
      this.mode = 'scroll';
      this.fadePhase = 'none';
      this.fade = 0;
      this.syncScrollToT();
    }
    this.onModeChange?.();
  }

  /** A visitor touched / scrolled / pressed a key. */
  userInput() {
    this.lastInput = performance.now();
    if (this.mode === 'auto') {
      this.mode = 'scroll';
      this.fadePhase = 'none';
      this.fade = 0;
      this.syncScrollToT();
      this.onModeChange?.();
    }
  }

  /** Lands on a scene's key moment (headline fully visible). */
  jumpTo(sceneIndex: number) {
    const i = clamp(sceneIndex, 0, SCENES.length - 1);
    const ft = SCENES[i].focus;
    if (this.mode === 'fixed') {
      this.t = this.target = ft;
      return;
    }
    if (this.mode === 'auto') this.userInput();
    const dist = Math.abs(ft - this.t);
    this.lenis.scrollTo(this.scrollFor(ft), {
      duration: this.reduced ? 0.01 : clamp(0.9 + dist * 0.05, 1.1, 2.6),
      easing: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
      force: true,
    });
  }

  next() {
    const i = SCENES.findIndex((s) => s.focus > this.t + 0.6);
    this.jumpTo(i === -1 ? SCENES.length - 1 : i);
  }
  prev() {
    let i = 0;
    for (let k = SCENES.length - 1; k >= 0; k--) {
      if (SCENES[k].focus < this.t - 0.6) {
        i = k;
        break;
      }
    }
    this.jumpTo(i);
  }

  private scrollFor(t: number) {
    return (t / FILM_DURATION) * this.lenis.limit;
  }

  private syncScrollToT() {
    this.suppressScrollSync = 2;
    this.lenis.scrollTo(this.scrollFor(this.t), { immediate: true, force: true });
    this.target = this.t;
  }

  /** Advance one frame. Returns film time. */
  update(dt: number, nowMs: number): number {
    this.lenis.raf(nowMs);
    const k = config.kiosk;
    if (this.mode === 'fixed') return this.t;

    if (this.mode === 'scroll') {
      if (this.suppressScrollSync > 0) this.suppressScrollSync--;
      else this.target = clamp(this.lenis.progress || 0) * FILM_DURATION;
      this.t = this.reduced ? this.target : damp(this.t, this.target, 6.5, dt);
      if (Math.abs(this.t - this.target) < 1e-4) this.t = this.target;
      if (this.kiosk && nowMs - this.lastInput > k.idleResumeSeconds * 1000) {
        this.mode = 'auto';
        this.onModeChange?.();
      }
      this.fade = damp(this.fade, 0, 8, dt);
      return this.t;
    }

    // ── autoplay (kiosk)
    if (this.fadePhase === 'none') {
      if (this.t < FILM_DURATION) {
        this.t = Math.min(FILM_DURATION, this.t + dt * k.speed);
      } else {
        this.holdTimer += dt;
        if (this.holdTimer > k.endHoldSeconds) {
          this.fadePhase = 'out';
          this.holdTimer = 0;
        }
      }
    } else if (this.fadePhase === 'out') {
      this.fade = Math.min(1, this.fade + dt / k.loopFadeSeconds);
      if (this.fade >= 1) {
        this.t = 0;
        this.fadePhase = 'in';
        this.lenis.scrollTo(0, { immediate: true, force: true });
        this.onLoop?.();
      }
    } else {
      this.t += dt * k.speed;
      this.fade = Math.max(0, this.fade - dt / k.loopFadeSeconds);
      if (this.fade <= 0) this.fadePhase = 'none';
    }
    return this.t;
  }
}
