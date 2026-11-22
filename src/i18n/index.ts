import en from './en.json';
import tk from './tk.json';
import ru from './ru.json';
import type { Lang } from '../config';
import type { SceneId } from '../core/timeline';

export type Copy = typeof en;
const ALL: Record<Lang, Copy> = { en, tk, ru };
export const LANGS: Lang[] = ['tk', 'ru', 'en'];

export function copy(lang: Lang): Copy {
  return ALL[lang] ?? en;
}

export function sceneCopy(lang: Lang, id: SceneId) {
  return copy(lang).scenes[id];
}

/** Splits "Plain *highlighted words* plain" into word tokens with a highlight flag. */
export function tokenize(text: string): { word: string; hi: boolean }[] {
  const out: { word: string; hi: boolean }[] = [];
  let hi = false;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    let w = raw;
    const start = w.startsWith('*');
    if (start) {
      hi = true;
      w = w.slice(1);
    }
    const end = w.endsWith('*') || /\*[.,!?:;…]*$/.test(w);
    w = w.replace(/\*/g, '');
    out.push({ word: w, hi });
    if (end) hi = false;
  }
  return out;
}
