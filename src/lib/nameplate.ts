// Nameplate (v10, decided): "Letterpress shadow". Instrument Serif re-rasterized on a grid of square cells,
// with a hairline-coloured copy offset by one cell behind it. Static.
// The cell scales with the font size (1.5 px at the 84 px desktop size), so every glyph keeps the same number
// of cells on a phone as on desktop; it never drops below 2 device pixels.

import { cssVar, deviceScale, onRelayout, palette } from './canvas';

const TEXT = 'The Singularity Times';
const CELL = 1.5; // grid cell at the full size, CSS px
const MAX_SIZE = 84; // font size cap, CSS px
const MIN_CELL_DEV = 2; // smallest cell, device px

function draw(cv: HTMLCanvasElement) {
  const family = cssVar('--f-name') || 'serif';
  const cw = cv.clientWidth || cv.parentElement?.clientWidth || 0;
  if (!cw) return;
  const dpr = deviceScale();
  const off = document.createElement('canvas');
  const o = off.getContext('2d', { willReadFrequently: true });
  const c = cv.getContext('2d');
  if (!o || !c) return;
  o.font = `400 100px ${family}`;
  const fsz = Math.min(MAX_SIZE, ((cw * 0.98) / o.measureText(TEXT).width) * 100);
  const cssH = Math.round(fsz * 1.22);
  cv.style.height = `${cssH}px`;
  const W = (cv.width = Math.round(cw * dpr));
  const H = (cv.height = Math.round(cssH * dpr));
  off.width = W;
  off.height = H;
  o.font = `400 ${fsz * dpr}px ${family}`;
  o.textAlign = 'center';
  o.fillStyle = '#000';
  o.fillText(TEXT, W / 2, H * 0.78);
  const a = o.getImageData(0, 0, W, H).data;

  // Summed-area table of coverage, so each cell's mean is four lookups.
  const ii = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += a[(y * W + x) * 4 + 3] / 255;
      ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row;
    }
  }
  const cov = (x0: number, y0: number, x1: number, y1: number) =>
    (ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]) / Math.max(1, (x1 - x0) * (y1 - y0));

  const b = Math.max(MIN_CELL_DEV, Math.round(CELL * (fsz / MAX_SIZE) * dpr));
  const on: [number, number, number, number][] = [];
  for (let y = 0; y < H; y += b) {
    const y1 = Math.min(H, y + b);
    for (let x = 0; x < W; x += b) {
      const x1 = Math.min(W, x + b);
      if (cov(x, y, x1, y1) > 0.5) on.push([x, y, x1 - x, y1 - y]);
    }
  }
  const p = palette();
  c.clearRect(0, 0, W, H);
  c.fillStyle = p.hair; // the letterpress shadow, one cell down and right
  for (const [x, y, w, h] of on) c.fillRect(x + b, y + b, w, h);
  c.fillStyle = p.ink;
  for (const [x, y, w, h] of on) c.fillRect(x, y, w, h);
}

export function mountNameplate(cv: HTMLCanvasElement) {
  const family = cssVar('--f-name') || 'serif';
  const go = () => draw(cv);
  // Draw only once the face is in; a fallback serif would flash a different nameplate.
  Promise.race([document.fonts.load(`400 100px ${family}`), new Promise((r) => setTimeout(r, 2500))])
    .catch(() => {})
    .then(() => {
      go();
      onRelayout(go);
    });
}
