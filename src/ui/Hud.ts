import QRCode from 'qrcode';
import { config, type Lang } from '../config';
import { copy, LANGS, sceneCopy } from '../i18n';
import { FILM_DURATION, SCENES, sceneIndexAt } from '../core/timeline';
import { clamp, ease, ramp } from '../core/math';
import { WordReveal } from './WordReveal';
import type { WorldState } from '../scenes/state';

const SCENE_HL = ['var(--alert)', 'var(--energy)', 'var(--accent)', 'var(--accent)', 'var(--accent)', 'var(--amber)'];

export interface HudCallbacks {
  onLang(lang: Lang): void;
  onSound(): void;
  onJump(sceneIndex: number): void;
}

/**
 * All DOM overlay: cinematic letterbox bars, brand, scene label, language
 * switcher, sound toggle, progress bar with scene markers + timecode,
 * headlines, split-screen labels, hours-saved counter and the final screen.
 */
export class Hud {
  private root: HTMLElement;
  private headlines: { wrap: HTMLElement; kicker: HTMLElement; reveal: WordReveal }[] = [];
  private finalReveal = new WordReveal('h2', 'final-headline');
  private lang: Lang;
  private els: Record<string, HTMLElement> = {};
  private langBtns: HTMLButtonElement[] = [];
  private markerEls: HTMLElement[] = [];
  private lastScene = -1;
  private lastTc = '';
  private lastCounter = '';
  private cache = new Map<string, string>();
  reduced = false;

  constructor(root: HTMLElement, lang: Lang, cb: HudCallbacks) {
    this.root = root;
    this.lang = lang;
    root.innerHTML = `
      <div class="scrim" data-el="scrim"></div>
      <div class="split-line" data-el="splitLine"></div>
      <div class="split-label a" data-el="labelA"><div class="sl-title"></div><div class="sl-text"></div></div>
      <div class="split-label b" data-el="labelB"><div class="sl-title"></div><div class="sl-text"></div></div>
      <div class="headlines" data-el="headlines"></div>
      <div class="counter" data-el="counter"><div class="c-num"><span data-el="counterNum">0</span><small data-el="counterUnit"></small></div><div class="c-label" data-el="counterLabel"></div></div>
      <div class="final" data-el="final">
        <div class="final-inner">
          <div class="final-text">
            <div class="kicker final-kicker" data-el="finalKicker"></div>
            <div data-el="finalHl"></div>
            <div class="final-tagline" data-el="finalTagline"></div>
          </div>
          <div class="final-card" data-el="finalCard">
            <div class="final-brand" data-el="finalBrand"></div>
            <div class="qr" data-el="qr"></div>
            <div class="final-cta" data-el="finalCta"></div>
            <div class="final-contact" data-el="finalContact"></div>
          </div>
        </div>
      </div>
      <header class="bar top">
        <div class="brand" data-el="brand"></div>
        <div class="scene-label" data-el="sceneLabel"></div>
        <div class="controls">
          <div class="langs" role="group" data-el="langs"></div>
          <button class="sound" data-el="sound" aria-pressed="false">
            <span class="eq"><i></i><i></i><i></i><i></i></span><span data-el="soundLabel"></span>
          </button>
        </div>
      </header>
      <footer class="bar bottom">
        <div class="tc" data-el="tc">00:00:00</div>
        <div class="progress" data-el="progress"><div class="track"><div class="fill" data-el="fill"></div></div><div class="markers" data-el="markers"></div></div>
        <div class="mode" data-el="mode"></div>
      </footer>
      <div class="hint" data-el="hint"><span data-el="hintText"></span><i></i></div>
      <div class="fader" data-el="fader"></div>
      <div class="debug" data-el="debug"></div>
    `;
    root.querySelectorAll<HTMLElement>('[data-el]').forEach((e) => (this.els[e.dataset.el!] = e));
    this.els.finalHl.appendChild(this.finalReveal.el);

    // brand
    const brand = this.els.brand;
    const fb = this.els.finalBrand;
    if (config.logoPath) {
      brand.innerHTML = `<img src="${config.logoPath}" alt="${escapeHtml(config.companyName)}">`;
      fb.innerHTML = `<img src="${config.logoPath}" alt="${escapeHtml(config.companyName)}">`;
    } else {
      brand.innerHTML = `<span class="dot"></span>${escapeHtml(config.companyName)}`;
      fb.textContent = config.companyName;
    }
    this.els.finalContact.textContent = config.contactLine;

    // QR (generated locally, offline)
    QRCode.toString(config.contactUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b0d10', light: '#00000000' } })
      .then((svg) => (this.els.qr.innerHTML = svg))
      .catch(() => (this.els.qr.textContent = config.contactUrl));

    // language buttons
    for (const l of LANGS) {
      const b = document.createElement('button');
      b.textContent = l.toUpperCase();
      b.lang = l;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        cb.onLang(l);
      });
      this.els.langs.appendChild(b);
      this.langBtns.push(b);
    }
    this.els.sound.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.onSound();
    });

    // progress markers
    SCENES.forEach((s, i) => {
      const m = document.createElement('button');
      m.className = 'marker';
      m.style.left = `${(s.start / FILM_DURATION) * 100}%`;
      m.innerHTML = `<span class="num">0${i + 1}</span><span class="name"></span>`;
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        cb.onJump(i);
      });
      this.els.markers.appendChild(m);
      this.markerEls.push(m);
    });

    // headlines (scenes 1–5; scene 6 headline lives in the final screen)
    for (let i = 0; i < 5; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'headline';
      wrap.style.setProperty('--hl', SCENE_HL[i]);
      const kicker = document.createElement('div');
      kicker.className = 'kicker';
      const reveal = new WordReveal('h2', 'hl');
      wrap.append(kicker, reveal.el);
      this.els.headlines.appendChild(wrap);
      this.headlines.push({ wrap, kicker, reveal });
    }
    this.setLang(lang);
  }

  setLang(lang: Lang) {
    this.lang = lang;
    document.documentElement.lang = lang;
    const c = copy(lang);
    document.title = `${c.meta.title} — ${config.companyName}`;
    this.headlines.forEach((h, i) => {
      const sc = sceneCopy(lang, SCENES[i].id);
      h.kicker.textContent = sc.kicker;
      h.reveal.setText(sc.headline);
    });
    const calm = sceneCopy(lang, 'calm');
    this.els.finalKicker.textContent = calm.kicker;
    this.finalReveal.setText(calm.headline);
    this.els.finalTagline.textContent = c.final.tagline;
    this.els.finalCta.textContent = c.final.cta;
    this.els.counterLabel.textContent = c.counter.label;
    this.els.counterUnit.textContent = c.counter.unit;
    this.els.soundLabel.textContent = c.ui.sound;
    this.els.langs.setAttribute('aria-label', c.ui.language);
    (this.els.labelA.children[0] as HTMLElement).textContent = c.split.localTitle;
    (this.els.labelA.children[1] as HTMLElement).textContent = c.split.localText;
    (this.els.labelB.children[0] as HTMLElement).textContent = c.split.cloudTitle;
    (this.els.labelB.children[1] as HTMLElement).textContent = c.split.cloudText;
    this.markerEls.forEach((m, i) => ((m.querySelector('.name') as HTMLElement).textContent = sceneCopy(lang, SCENES[i].id).marker));
    this.langBtns.forEach((b) => b.classList.toggle('on', b.lang === lang));
    this.lastScene = -1;
  }

  setSound(on: boolean) {
    this.els.sound.classList.toggle('on', on);
    this.els.sound.setAttribute('aria-pressed', String(on));
  }

  setMode(text: string, autoplay: boolean, hint: string | null) {
    const key = `${text}|${autoplay}|${hint}`;
    if (this.cache.get('modeKey') === key) return;
    this.cache.set('modeKey', key);
    this.set('mode', 'text', text);
    this.els.mode.classList.toggle('live', autoplay);
    this.set('hintText', 'text', hint ?? '');
    this.els.hint.classList.toggle('show', !!hint);
  }

  setFade(v: number) {
    this.style('fader', 'opacity', v.toFixed(3));
    this.els.fader.style.pointerEvents = v > 0.01 ? 'auto' : 'none';
  }

  setDebug(text: string | null) {
    this.els.debug.style.display = text ? 'block' : 'none';
    if (text) this.els.debug.textContent = text;
  }

  update(t: number, s: WorldState, divider: number, portrait: boolean) {
    // headlines
    this.headlines.forEach((h, i) => {
      const sc = SCENES[i];
      const vis = t > sc.headlineIn - 0.2 && t < sc.headlineOut + 1.5;
      h.wrap.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) return;
      h.reveal.update(t, sc.headlineIn + 0.25, sc.headlineOut, this.reduced);
      const k = clamp((t - sc.headlineIn) / 0.8) * (1 - clamp((t - sc.headlineOut) / 0.5));
      h.kicker.style.opacity = k.toFixed(3);
      h.kicker.style.setProperty('--line', ease.outCubic(clamp((t - sc.headlineIn) / 1.2)).toFixed(3));
    });

    // split screen labels + divider line
    const lab = s.splitLabels;
    this.style('labelA', 'opacity', lab.toFixed(3));
    this.style('labelB', 'opacity', lab.toFixed(3));
    this.style('labelA', 'transform', `translate3d(0,${((1 - lab) * 18).toFixed(1)}px,0)`);
    this.style('labelB', 'transform', `translate3d(0,${((1 - lab) * 18).toFixed(1)}px,0)`);
    const lineOn = divider > 0.002 && divider < 0.998;
    this.style('splitLine', 'opacity', lineOn ? '1' : '0');
    if (portrait) {
      this.style('splitLine', 'transform', `translate3d(0,${(divider * 100).toFixed(3)}vh,0)`);
      this.style('labelB', 'top', `calc(${(divider * 100).toFixed(2)}vh + 3.2vh)`);
      this.style('labelA', 'top', `calc(var(--bar-top) + 2vh)`);
    } else {
      this.style('splitLine', 'transform', `translate3d(${(divider * 100).toFixed(3)}vw,0,0)`);
      this.style('labelB', 'left', `calc(${(divider * 100).toFixed(2)}vw + 3vw)`);
    }
    this.root.classList.toggle('portrait', portrait);

    // counter
    this.style('counter', 'opacity', s.counterVisible.toFixed(3));
    const cv = String(Math.round(s.hoursSaved));
    if (cv !== this.lastCounter) {
      this.els.counterNum.textContent = cv;
      this.lastCounter = cv;
    }

    // final screen
    const f = s.finalScreen;
    this.style('final', 'opacity', Math.min(1, f * 1.5).toFixed(3));
    this.els.final.style.visibility = f > 0.001 ? 'visible' : 'hidden';
    this.els.final.style.pointerEvents = f > 0.5 ? 'auto' : 'none';
    const fin = SCENES[5].headlineIn;
    this.finalReveal.update(t, fin + 0.3, Infinity, this.reduced, 0.08, 1.1);
    const card = ease.outCubic(ramp(t, fin + 1.2, fin + 2.6));
    this.style('finalCard', 'opacity', card.toFixed(3));
    this.style('finalCard', 'transform', `translate3d(0,${((1 - card) * 30).toFixed(1)}px,0)`);
    this.style('finalTagline', 'opacity', ease.outCubic(ramp(t, fin + 2.0, fin + 3.0)).toFixed(3));
    this.style('finalKicker', 'opacity', ease.outCubic(ramp(t, fin, fin + 1)).toFixed(3));
    this.style('scrim', 'opacity', (0.55 + 0.45 * f).toFixed(3));

    // progress + labels
    this.style('fill', 'transform', `scaleX(${(t / FILM_DURATION).toFixed(4)})`);
    const si = sceneIndexAt(t);
    if (si !== this.lastScene) {
      this.lastScene = si;
      this.markerEls.forEach((m, i) => {
        m.classList.toggle('active', i === si);
        m.classList.toggle('past', i < si);
      });
      const sc = sceneCopy(this.lang, SCENES[si].id);
      this.els.sceneLabel.innerHTML = `<b>0${si + 1}</b><span>/06</span><em>${escapeHtml(sc.marker)}</em>`;
      document.documentElement.style.setProperty('--scene-hl', SCENE_HL[Math.min(si, 5)]);
    }
    const sec = Math.floor(t);
    const fr = Math.floor((t - sec) * 24);
    const tc = `00:${pad(sec)}:${pad(fr)}`;
    if (tc !== this.lastTc) {
      this.els.tc.textContent = tc;
      this.lastTc = tc;
    }
  }

  /** Cached style setter — touches the DOM only when the value changes. */
  private style(el: string, prop: string, value: string) {
    const key = el + prop;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    this.els[el].style.setProperty(prop, value);
  }
  private set(el: string, _kind: 'text', value: string) {
    const key = el + '#text';
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    this.els[el].textContent = value;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
