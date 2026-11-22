import type { PerspectiveCamera, Scene, WebGLRenderer, WebGLRenderTarget } from 'three';
import { Pass } from 'postprocessing';

/**
 * Renders the scene through up to two cameras into one HDR buffer.
 *  divider = 1   → only camera A (full frame)
 *  divider = 0.5 → A on the left/top half, B on the right/bottom half
 *  divider = 0   → only camera B
 * Used for the "You choose" split screen in scene 4 — the wipe is animated by
 * moving the divider, so it's a deliberate, smooth cut rather than a jump.
 */
export class SplitRenderPass extends Pass {
  divider = 1;
  /** true → split top/bottom (portrait phones), false → left/right. */
  vertical = false;

  constructor(private sceneRef: Scene, public camA: PerspectiveCamera, public camB: PerspectiveCamera) {
    super('SplitRenderPass');
    this.needsSwap = false;
  }

  /** Size (in CSS-independent fraction of the frame) of each view, for camera aspect. */
  viewFractions() {
    return { a: this.divider, b: 1 - this.divider };
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null) {
    const target = this.renderToScreen ? null : inputBuffer;
    const scene = this.sceneRef;
    const d = this.divider;
    if (!target) {
      renderer.setRenderTarget(null);
      renderer.render(scene, d > 0.001 ? this.camA : this.camB);
      return;
    }
    const W = target.width;
    const H = target.height;
    if (d >= 0.999 || d <= 0.001) {
      target.viewport.set(0, 0, W, H);
      target.scissorTest = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, d >= 0.999 ? this.camA : this.camB);
      return;
    }
    renderer.setRenderTarget(target);
    renderer.clear();
    if (!this.vertical) {
      const wa = Math.round(W * d);
      this.renderView(renderer, target, this.camA, 0, 0, wa, H);
      this.renderView(renderer, target, this.camB, wa, 0, W - wa, H);
    } else {
      // A on top, B at the bottom (GL origin is bottom-left)
      const ha = Math.round(H * d);
      this.renderView(renderer, target, this.camA, 0, H - ha, W, ha);
      this.renderView(renderer, target, this.camB, 0, 0, W, H - ha);
    }
    target.viewport.set(0, 0, W, H);
    target.scissor.set(0, 0, W, H);
    target.scissorTest = false;
    renderer.setRenderTarget(target);
  }

  private renderView(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget,
    cam: PerspectiveCamera,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (w < 1 || h < 1) return;
    target.viewport.set(x, y, w, h);
    target.scissor.set(x, y, w, h);
    target.scissorTest = true;
    renderer.setRenderTarget(target);
    renderer.render(this.sceneRef, cam);
  }
}
