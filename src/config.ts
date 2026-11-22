/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BOOTH CONFIGURATION — the only file you normally need to edit.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Texts live in src/i18n/{tk,ru,en}.json. Everything else is here.
 */

export type Lang = 'tk' | 'ru' | 'en';

export interface SiteConfig {
  /** Shown in the top bar and on the final screen. */
  companyName: string;
  /**
   * Optional logo. Put the file into /public (e.g. public/logo.svg) and set
   * `logoPath: 'logo.svg'`. Leave empty ('') to show the company name as text.
   */
  logoPath: string;
  /** Brand accent colour (hex). Used for the trained AI Core, agents and highlights. */
  brandAccentColor: string;
  /** URL encoded in the QR code on the final screen (generated locally, works offline). */
  contactUrl: string;
  /** Short contact line under the QR code (e.g. website · phone · e-mail). */
  contactLine: string;
  /**
   * ✏️ EDITABLE PLACEHOLDER — "Hours saved per week" counter in scene 5.
   * Replace with a realistic number for your typical client.
   */
  hoursSavedPerWeek: number;
  /** Language on first load (visitors can switch with TK / RU / EN). */
  defaultLanguage: Lang;
  kiosk: {
    /** Seconds the final screen stays up before the film fades and loops. */
    endHoldSeconds: number;
    /** Fade-to-black duration between loops (seconds). */
    loopFadeSeconds: number;
    /** After this many seconds without input, autoplay resumes. */
    idleResumeSeconds: number;
    /** Playback speed multiplier for the film (1 = ~84 s story). */
    speed: number;
    /** In kiosk mode, rotate through the languages on every loop. */
    cycleLanguages: boolean;
  };
  /** Scroll length of the story in viewport heights (scroll mode). */
  scrollLengthVh: number;
}

export const config: SiteConfig = {
  companyName: 'Your Company',
  logoPath: '',
  brandAccentColor: '#b6ff3b',
  contactUrl: 'https://example.com/ai',
  contactLine: 'example.com · +993 00 000000 · hello@example.com',
  hoursSavedPerWeek: 120, // ✏️ placeholder — edit me
  defaultLanguage: 'tk',
  kiosk: {
    endHoldSeconds: 6,
    loopFadeSeconds: 1.6,
    idleResumeSeconds: 30,
    speed: 1,
    cycleLanguages: false,
  },
  scrollLengthVh: 1300,
};
