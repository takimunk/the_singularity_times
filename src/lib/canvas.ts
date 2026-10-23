// Shared helpers for the page's canvas drawings: brand colours from CSS, DPR-aware sizing, seeded randomness.

export const DPR = Math.min(2, window.devicePixelRatio || 1);
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Palette {
  ink: string;
  soft: string;
  paper: string;
  paperDeep: string;
  hair: string;
  earth: string;
  ray: string;
  mono: string;
}

export function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    ink: v('--ink'),
    soft: v('--ink-soft'),
    paper: v('--paper'),
    paperDeep: v('--paper-deep'),
    hair: v('--hair'),
    earth: v('--earth'),
    ray: v('--ray'),
    mono: v('--f-mono'),
  };
}

/** Sizes the canvas backing store to its CSS box at DPR and returns the CSS size. */
export function fit(cv: HTMLCanvasElement): [number, number] {
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * DPR));
  const h = Math.max(1, Math.round(r.height * DPR));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return [r.width, r.height];
}

/** Deterministic LCG in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Calls fn on theme changes (system scheme or data-theme) and debounced resizes. */
export function onRelayout(fn: () => void) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  let t: number | undefined;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(fn, 150);
  });
  document.fonts?.ready.then(fn);
}

/** Live device pixel ratio (not capped at 2 like DPR), for drawings that must land on exact device pixels. */
export function deviceScale(cap = 3): number {
  return Math.min(cap, window.devicePixelRatio || 1);
}

/** Reads one CSS custom property from :root (for tokens palette() does not carry). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour as an rgba() string with the given alpha (resolved by the canvas itself). */
export function withAlpha(color: string, alpha: number): string {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return color;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${alpha})`;
}
