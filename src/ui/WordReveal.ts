import { tokenize } from '../i18n';
import { clamp, ease } from '../core/math';

/**
 * Split-text headline whose per-word reveal is driven by FILM TIME (not CSS
 * transitions) — so it scrubs perfectly with scroll and plays in kiosk mode.
 * Words rise out of a mask line by line, then lift away cleanly.
 */
export class WordReveal {
  readonly el: HTMLElement;
  private inners: HTMLElement[] = [];
  private last: string[] = [];

  constructor(tag: string, className: string) {
    this.el = document.createElement(tag);
    this.el.className = className;
  }

  setText(text: string) {
    this.el.textContent = '';
    this.inners = [];
    this.last = [];
    const tokens = tokenize(text);
    tokens.forEach((tk, i) => {
      const w = document.createElement('span');
      w.className = 'w' + (tk.hi ? ' hi' : '');
      const inner = document.createElement('span');
      inner.className = 'wi';
      inner.textContent = tk.word;
      w.appendChild(inner);
      this.el.appendChild(w);
      if (i < tokens.length - 1) this.el.appendChild(document.createTextNode(' '));
      this.inners.push(inner);
      this.last.push('');
    });
    this.el.setAttribute('aria-label', tokens.map((t) => t.word).join(' '));
  }

  /**
   * @param tin  film time the reveal starts
   * @param tout film time the exit starts (Infinity = stays)
   */
  update(t: number, tin: number, tout: number, reduced: boolean, stagger = 0.075, dur = 0.95) {
    const n = this.inners.length;
    for (let i = 0; i < n; i++) {
      const pin = ease.outQuart(clamp((t - tin - i * stagger) / dur));
      const pout = ease.inCubic(clamp((t - tout - i * stagger * 0.45) / 0.65));
      let css: string;
      if (reduced) {
        css = `opacity:${(pin * (1 - pout)).toFixed(3)}`;
      } else {
        const y = (1 - pin) * 112 - pout * 112;
        const r = (1 - pin) * 6;
        const o = Math.min(1, pin * 1.6) * (1 - pout);
        css = `transform:translate3d(0,${y.toFixed(1)}%,0) rotate(${r.toFixed(2)}deg);opacity:${o.toFixed(3)}`;
      }
      if (css !== this.last[i]) {
        this.inners[i].style.cssText = css;
        this.last[i] = css;
      }
    }
  }
}
