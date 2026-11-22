import {
  HalfFloatType,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { SplitRenderPass } from './SplitRenderPass';
import { GradeEffect, TiltShiftLiteEffect } from './effects';
import { TIERS, type QualitySettings, type Tier } from '../core/quality';

/** Layers: 0 = shared world, 1 = only in view A (local AI dome), 2 = only in view B (cloud beam). */
export const LAYER_A = 1;
export const LAYER_B = 2;

/**
 * Owns the WebGL renderer, the scene graph root, both story cameras and the
 * post-processing chain:
 *   SplitRenderPass (HDR, MSAA) → TiltShift (HDR) → Bloom + ACES + Grade
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camA = new PerspectiveCamera(32, 16 / 9, 0.1, 400);
  readonly camB = new PerspectiveCamera(32, 16 / 9, 0.1, 400);
  readonly composer: EffectComposer;
  readonly split: SplitRenderPass;
  readonly tilt = new TiltShiftLiteEffect();
  readonly grade = new GradeEffect();
  readonly bloom: BloomEffect;
  private tiltPass: EffectPass;
  private finalPass: EffectPass;
  private pmrem: PMREMGenerator;
  quality: QualitySettings;
  renderScale = 1;
  width = 1;
  height = 1;
  pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement, tier: Tier) {
    this.quality = { ...TIERS[tier] };
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NoToneMapping; // ACES is applied in the post chain (HDR bloom first)
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = PCFSoftShadowMap;
    r.setClearColor(0x0b0f16, 1);

    this.camA.layers.enable(LAYER_A);
    this.camB.layers.enable(LAYER_B);

    // Procedural studio environment for soft reflections (no HDR files needed).
    this.pmrem = new PMREMGenerator(r);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.composer = new EffectComposer(r, {
      frameBufferType: HalfFloatType,
      multisampling: Math.min(this.quality.msaa, r.capabilities.maxSamples),
    });
    this.split = new SplitRenderPass(this.scene, this.camA, this.camB);
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 1.15,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.28,
      radius: 0.72,
      levels: this.quality.bloomLevels,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.tiltPass = new EffectPass(this.camA, this.tilt);
    this.finalPass = new EffectPass(this.camA, this.bloom, tone, this.grade);
    this.composer.addPass(this.split);
    this.composer.addPass(this.tiltPass);
    this.composer.addPass(this.finalPass);
    this.tiltPass.enabled = this.quality.tiltShift;
  }

  get portrait() {
    return this.height > this.width * 1.05;
  }
  get aspect() {
    return this.width / this.height;
  }

  /** Apply a (possibly degraded) quality tier at runtime. */
  setTier(tier: Tier) {
    this.quality = { ...TIERS[tier] };
    const r = this.renderer;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.needsUpdate = true;
    this.composer.multisampling = Math.min(this.quality.msaa, r.capabilities.maxSamples);
    this.tiltPass.enabled = this.quality.tiltShift;
    this.scene.traverse((o) => {
      const m = (o as unknown as { material?: { needsUpdate: boolean } }).material;
      if (m) m.needsUpdate = true; // shadow on/off changes shader programs
    });
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = Math.sqrt(this.quality.maxPixels / (w * h));
    this.pixelRatio = Math.max(0.5, Math.min(dpr, budget) * this.renderScale);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
  }

  render(dt: number) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.pmrem.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
