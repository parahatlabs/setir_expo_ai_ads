import type { Cue } from '../core/timeline';

/**
 * Fully synthesized soundtrack (Web Audio, no files): an evolving ambient pad
 * whose chord follows the story (tense → open → bright → warm), a soft
 * reverb, clock ticks in the chaos scene and UI blips on story cues.
 * Off by default; browsers only allow audio after a user gesture anyway.
 */

const CHORDS: number[][] = [
  [110.0, 164.81, 196.0, 233.08], // chaos: A–E–G–B♭ (tension)
  [110.0, 164.81, 220.0, 329.63], // spark: open fifths
  [130.81, 196.0, 261.63, 392.0], // training: C power + shimmer
  [146.83, 220.0, 293.66, 440.0], // security: D sus
  [130.81, 196.0, 246.94, 329.63], // agents: Cmaj7
  [87.31, 174.61, 220.0, 329.63], // calm: Fmaj7
];
const CUTOFF = [520, 700, 1500, 1300, 2200, 1200];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

export class Sound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padGain!: GainNode;
  private filter!: BiquadFilterNode;
  private voices: OscillatorNode[][] = [];
  private reverb!: ConvolverNode;
  private fx!: GainNode;
  private scene = -1;
  private doneIdx = 0;
  private lastTick = 0;
  private noiseBuf: AudioBuffer | null = null;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.start();
    else this.stop();
    return this.enabled;
  }

  private start() {
    if (!this.ctx) this.build();
    const c = this.ctx!;
    c.resume();
    this.master.gain.cancelScheduledValues(c.currentTime);
    this.master.gain.setTargetAtTime(0.8, c.currentTime, 0.4);
  }

  private stop() {
    if (!this.ctx) return;
    const c = this.ctx;
    this.master.gain.setTargetAtTime(0, c.currentTime, 0.15);
    window.setTimeout(() => {
      if (!this.enabled) c.suspend();
    }, 900);
  }

  private build() {
    const c = new AudioContext();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);

    // generated impulse response → lush reverb
    const len = c.sampleRate * 3.2;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = c.createConvolver();
    this.reverb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.7;
    this.padGain = c.createGain();
    this.padGain.gain.value = 0.11;
    this.filter.connect(this.padGain);
    this.padGain.connect(this.master);
    this.padGain.connect(this.reverb);

    // slow filter LFO
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(this.filter.frequency);
    lfo.start();

    for (let v = 0; v < 4; v++) {
      const pair: OscillatorNode[] = [];
      for (let k = 0; k < 2; k++) {
        const o = c.createOscillator();
        o.type = k === 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = CHORDS[0][v];
        o.detune.value = (k === 0 ? -7 : 6) + v * 1.5;
        const g = c.createGain();
        g.gain.value = k === 0 ? 0.35 : 0.6;
        o.connect(g).connect(this.filter);
        o.start();
        pair.push(o);
      }
      this.voices.push(pair);
    }

    this.fx = c.createGain();
    this.fx.gain.value = 0.5;
    this.fx.connect(this.master);
    this.fx.connect(this.reverb);

    this.noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.scene = -1;
  }

  /** Called every frame. */
  update(sceneIndex: number, clockSpeed: number, clockHours: number) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    if (sceneIndex !== this.scene) {
      this.scene = sceneIndex;
      const ch = CHORDS[sceneIndex];
      this.voices.forEach((pair, v) => pair.forEach((o) => o.frequency.setTargetAtTime(ch[v % ch.length], c.currentTime, 1.2)));
      this.filter.frequency.setTargetAtTime(CUTOFF[sceneIndex], c.currentTime, 1.5);
      if (sceneIndex < 4) this.doneIdx = 0;
    }
    // clock ticks while the clock races (chaos)
    if (clockSpeed > 0.4) {
      const tick = Math.floor(clockHours * 60);
      if (tick !== this.lastTick && c.currentTime - this.tickAt > 0.11) {
        this.lastTick = tick;
        this.tickAt = c.currentTime;
        this.click(0.05, 3200);
      }
    }
  }
  private tickAt = 0;

  cue(kind: Cue['kind']) {
    if (!this.enabled || !this.ctx) return;
    switch (kind) {
      case 'whoosh':
        this.sweep(4.2, 200, 3200, 0.22);
        break;
      case 'land':
        this.tone(55, 2.5, 0.5, 'sine', 30);
        this.tone(880, 2.2, 0.08, 'sine');
        this.tone(1318.5, 2.6, 0.05, 'sine');
        break;
      case 'absorb':
        this.sweep(6, 300, 5000, 0.12);
        break;
      case 'shield':
        [1046.5, 1318.5, 1568].forEach((f, i) => this.tone(f, 2.0, 0.05, 'sine', 0, i * 0.08));
        break;
      case 'beam':
        this.tone(440, 0.9, 0.06, 'triangle', 1320);
        break;
      case 'launch':
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 0.6, 0.07, 'triangle', 0, i * 0.06));
        break;
      case 'done':
        this.tone(PENTA[this.doneIdx % PENTA.length], 0.7, 0.09, 'sine');
        this.tone(PENTA[this.doneIdx % PENTA.length] * 2, 0.4, 0.03, 'sine');
        this.doneIdx++;
        break;
      case 'calm':
        this.tone(349.23, 3, 0.05, 'sine');
        break;
      case 'final':
        [174.61, 261.63, 329.63, 440].forEach((f, i) => this.tone(f, 4, 0.05, 'sine', 0, i * 0.12));
        break;
    }
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType, glideTo = 0, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => g.disconnect();
  }

  private sweep(dur: number, f0: number, f1: number, vol: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(g).connect(this.fx);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => g.disconnect();
  }

  private click(vol: number, freq: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(hp).connect(g).connect(this.fx);
    src.start(t, Math.random());
    src.stop(t + 0.05);
    src.onended = () => g.disconnect();
  }
}
