import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './styles.css';

import { config, type Lang } from './config';
import { Stage } from './render/Stage';
import { Atmosphere } from './render/Atmosphere';
import { CameraRig } from './render/CameraRig';
import { World } from './world/World';
import { createState } from './scenes/state';
import { evaluate } from './scenes';
import { Playback } from './core/Playback';
import { CUES, FILM_DURATION, sceneIndexAt } from './core/timeline';
import { detectTier, FrameGovernor, type Tier } from './core/quality';
import { Hud } from './ui/Hud';
import { Sound } from './audio/Sound';
import { copy, LANGS } from './i18n';

/**
 * Bootstrap: one master timeline drives everything.
 *   Playback (scroll | kiosk) → film time t → evaluate(t) → World + Camera + Light + HUD
 */
async function main() {
  const params = new URLSearchParams(location.search);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
  const debug = params.has('debug');

  // Fonts must be ready before the atlas / TV canvas text is drawn.
  await Promise.all([
    document.fonts.load('800 64px Manrope'),
    document.fonts.load('700 64px Unbounded'),
    document.fonts.load('500 32px Unbounded'),
  ]).catch(() => undefined);

  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const probe = document.createElement('canvas').getContext('webgl2');
  const { tier: initialTier, gpu } = detectTier(probe);
  probe?.getExtension('WEBGL_lose_context')?.loseContext();

  let tier: Tier = initialTier;
  const stage = new Stage(canvas, tier);
  stage.resize();
  const atmo = new Atmosphere(stage);
  const rig = new CameraRig();
  rig.reducedMotion = reduced;
  const world = new World(stage);
  const state = createState();

  // Pre-compile every shader once (including objects hidden until later
  // scenes) so the first kiosk loop has no compile hitches.
  {
    const hidden: { visible: boolean }[] = [];
    stage.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const all = stage.camA.layers.mask;
    stage.camA.layers.enableAll();
    stage.renderer.compile(stage.scene, stage.camA);
    stage.camA.layers.mask = all;
    hidden.forEach((o) => (o.visible = false));
  }

  let lang: Lang = (params.get('lang') as Lang) || (localStorageGet('lang') as Lang) || config.defaultLanguage;
  if (!LANGS.includes(lang)) lang = config.defaultLanguage;

  const sound = new Sound();
  const playback = new Playback(document.getElementById('scroll-spacer')!, reduced);
  const hud = new Hud(document.getElementById('hud')!, lang, {
    onLang: (l) => setLang(l),
    onSound: () => hud.setSound(sound.toggle()),
    onJump: (i) => playback.jumpTo(i),
  });
  hud.reduced = reduced;

  function setLang(l: Lang) {
    lang = l;
    hud.setLang(l);
    updateModeUi();
    localStorageSet('lang', l);
  }

  const updateModeUi = () => {
    const c = copy(lang).ui;
    const auto = playback.mode === 'auto';
    const atStart = playback.mode === 'scroll' && playback.t < 0.6;
    hud.setMode(playback.kiosk ? c.kiosk : '', auto, auto ? c.touch : atStart ? c.scroll : null);
  };
  playback.onModeChange = updateModeUi;
  playback.onLoop = () => {
    if (playback.kiosk && config.kiosk.cycleLanguages) setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
  };
  const speed = parseFloat(params.get('speed') ?? '');
  if (speed > 0) config.kiosk.speed = speed;
  if (params.get('mode') === 'kiosk') playback.setKiosk(true);
  updateModeUi();

  // ── keyboard: ←/→/↑/↓/space = scenes, K = kiosk, F = fullscreen, M = sound
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        playback.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        playback.prev();
        break;
      case 'Home':
        e.preventDefault();
        playback.jumpTo(0);
        break;
      case 'k':
      case 'K':
        playback.setKiosk(!playback.kiosk);
        updateModeUi();
        break;
      case 'f':
      case 'F':
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
        else document.exitFullscreen?.();
        break;
      case 'm':
      case 'M':
        hud.setSound(sound.toggle());
        break;
    }
  });

  // ── quality governor (auto fallback for weak GPUs)
  const governor = new FrameGovernor((kind) => {
    if (kind === 'scale') {
      stage.renderScale = governor.renderScale;
      stage.resize();
    } else if (tier !== 'low') {
      tier = tier === 'high' ? 'medium' : 'low';
      stage.renderScale = 1;
      stage.setTier(tier);
      atmo.setShadowMapSize(stage.quality.shadowMapSize);
      world.applyQuality();
    }
  }, !params.has('quality') && playback.mode !== 'fixed');

  window.addEventListener('resize', () => stage.resize());

  // ── main loop
  let last = performance.now();
  let time = 0;
  let prevT = playback.t;
  let firstFrame = true;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    governor.tick(dt);

    const t = playback.update(dt, now);
    evaluate(t, time, state);

    // split view: aspect of each half
    const portrait = stage.portrait;
    const div = state.divider;
    stage.split.divider = div;
    stage.split.vertical = portrait;
    const full = stage.aspect;
    const aspA = portrait ? full / Math.max(0.05, div) : full * Math.max(0.05, div);
    const aspB = portrait ? full / Math.max(0.05, 1 - div) : full * Math.max(0.05, 1 - div);
    rig.apply(t, time, stage.camA, stage.camB, aspA, aspB, portrait);
    const activeCam = div > 0.001 ? stage.camA : stage.camB;

    atmo.update(t, time);
    world.update(state, dt, atmo, activeCam);

    const [focus, band, blur] = rig.focusAt(t);
    const splitting = div > 0.002 && div < 0.998;
    stage.tilt.set(focus, band, 0.32, splitting && portrait ? 0 : blur * Math.min(1.4, stage.pixelRatio));
    stage.grade.u('grain').value = stage.quality.grain ? (reduced ? 0.02 : 0.045) : 0;
    stage.grade.u('seed').value = reduced ? 0 : (time * 24) % 97;
    stage.grade.u('fade').value = 0;
    stage.renderer.info.reset();
    stage.render(dt);

    hud.update(t, state, div, portrait);
    updateModeUi(); // cheap: HUD caches and only touches the DOM on change
    hud.setFade(playback.fade);

    // story cues (sound) when playing forwards
    if (t > prevT && t - prevT < 0.5) {
      for (const c of CUES) if (c.t > prevT && c.t <= t) sound.cue(c.kind);
    }
    prevT = t;
    sound.update(sceneIndexAt(t), state.clockSpeed, world.clockHours);

    if (debug) {
      const info = stage.renderer.info;
      hud.setDebug(
        `${governor.fps.toFixed(0)} fps · ${tier} · scale ${stage.renderScale.toFixed(2)} · dpr ${stage.pixelRatio.toFixed(2)}\n` +
          `t ${t.toFixed(2)} / ${FILM_DURATION} · ${playback.mode}${playback.kiosk ? ' (kiosk)' : ''}\n` +
          `draws ${info.render.calls} · tris ${(info.render.triangles / 1000).toFixed(0)}k · geo ${info.memory.geometries} · tex ${info.memory.textures}\n${gpu}`,
      );
    }
    if (firstFrame) {
      firstFrame = false;
      document.body.classList.add('ready');
    }
  };
  stage.renderer.info.autoReset = false;
  if (debug) (window as unknown as { __story: unknown }).__story = { playback, state, stage, setLang };
  requestAnimationFrame(frame);

  // free GPU memory if the page is torn down (and during dev hot reload)
  window.addEventListener('pagehide', () => stage.dispose());
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem('expo-ai-' + k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem('expo-ai-' + k, v);
  } catch {
    /* private mode — ignore */
  }
}

main();
