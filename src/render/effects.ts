import { Uniform, Vector3 } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

/**
 * HDR-safe tilt-shift (miniature look). A 16-tap golden-angle disc blur whose
 * radius grows away from a horizontal focus band. Runs on the linear HDR scene
 * BEFORE bloom so glowing objects keep their energy when out of focus.
 */
export class TiltShiftLiteEffect extends Effect {
  constructor() {
    super(
      'TiltShiftLite',
      /* glsl */ `
      uniform float focus;
      uniform float band;
      uniform float feather;
      uniform float maxBlur;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float d = abs(uv.y - focus);
        float m = smoothstep(band, band + feather, d);
        // slightly stronger towards the top (far background in our framing)
        m *= mix(1.0, 1.25, step(focus, uv.y));
        if (m < 0.02 || maxBlur < 0.01) { outputColor = inputColor; return; }
        vec2 r = texelSize * maxBlur * m;
        vec4 acc = inputColor;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float a = fi * 2.39996323;
          float rad = sqrt((fi + 0.5) / 16.0);
          acc += texture2D(inputBuffer, uv + vec2(cos(a), sin(a)) * rad * r);
        }
        outputColor = acc / 17.0;
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ['focus', new Uniform(0.45)],
          ['band', new Uniform(0.16)],
          ['feather', new Uniform(0.32)],
          ['maxBlur', new Uniform(7.0)],
        ]),
      },
    );
  }
  set(focus: number, band: number, feather: number, maxBlur: number) {
    this.uniforms.get('focus')!.value = focus;
    this.uniforms.get('band')!.value = band;
    this.uniforms.get('feather')!.value = feather;
    this.uniforms.get('maxBlur')!.value = maxBlur;
  }
}

/**
 * Final colour grade: tint/lift, saturation, contrast (in perceptual space),
 * vignette and animated film grain. Runs after tone mapping.
 */
export class GradeEffect extends Effect {
  constructor() {
    super(
      'Grade',
      /* glsl */ `
      uniform vec3 tint;
      uniform vec3 lift;
      uniform float saturation;
      uniform float contrast;
      uniform float vignette;
      uniform float grain;
      uniform float fade;
      uniform float seed;

      float h12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb, 0.0) * tint;
        // perceptual space for grading
        vec3 g = sqrt(c);
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        g = mix(vec3(l), g, saturation);
        g = (g - 0.5) * contrast + 0.5;
        g += lift * (1.0 - smoothstep(0.0, 0.6, l));
        g = max(g, 0.0);
        // vignette (aspect aware, soft)
        vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
        float v = smoothstep(1.15, 0.25, length(d) * 1.05);
        g *= mix(1.0, v, vignette);
        // grain (luminance weighted, stronger in mids)
        float n = h12(uv * resolution + seed * 917.0) - 0.5;
        g += n * grain * (0.35 + 0.65 * (1.0 - abs(l - 0.5) * 2.0));
        g *= (1.0 - fade);
        c = g * g;
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ['tint', new Uniform(new Vector3(1, 1, 1))],
          ['lift', new Uniform(new Vector3(0, 0, 0))],
          ['saturation', new Uniform(1)],
          ['contrast', new Uniform(1)],
          ['vignette', new Uniform(0.5)],
          ['grain', new Uniform(0.04)],
          ['fade', new Uniform(0)],
          ['seed', new Uniform(0)],
        ]),
      },
    );
  }
  u(name: string) {
    return this.uniforms.get(name)!;
  }
}
