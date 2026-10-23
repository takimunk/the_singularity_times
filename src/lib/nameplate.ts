// Nameplate: "The Singularity Times" in Instrument Serif, re-rasterized on a 1.5 px grid ("Instrument fine px"). Static.

import { DPR, cssVar, onRelayout, palette } from './canvas';

const TEXT = 'The Singularity Times';
const CELL = 1.5; // grid cell, CSS px
const MAX_SIZE = 84; // font size cap, CSS px

function draw(cv: HTMLCanvasElement) {
  const family = cssVar('--f-name') || 'serif';
  const cw = cv.clientWidth || cv.parentElement?.clientWidth || 0;
  if (!cw) return;
  const off = document.createElement('canvas');
  const o = off.getContext('2d', { willReadFrequently: true });
  const c = cv.getContext('2d');
  if (!o || !c) return;
  o.font = `400 100px ${family}`;
  const fsz = Math.min(MAX_SIZE, ((cw * 0.98) / o.measureText(TEXT).width) * 100);
  const cssH = Math.round(fsz * 1.22);
  cv.style.height = `${cssH}px`;
  const W = (cv.width = Math.round(cw * DPR));
  const H = (cv.height = Math.round(cssH * DPR));
  off.width = W;
  off.height = H;
  o.font = `400 ${fsz * DPR}px ${family}`;
  o.textAlign = 'center';
  o.fillText(TEXT, W / 2, H * 0.78);
  const a = o.getImageData(0, 0, W, H).data;
  const b = Math.max(2, Math.round(CELL * DPR));
  c.clearRect(0, 0, W, H);
  c.fillStyle = palette().ink;
  for (let y = 0; y < H; y += b) {
    for (let x = 0; x < W; x += b) {
      let s = 0;
      let n = 0;
      for (let yy = y; yy < Math.min(H, y + b); yy++) {
        for (let xx = x; xx < Math.min(W, x + b); xx++) {
          s += a[(yy * W + xx) * 4 + 3];
          n++;
        }
      }
      if (s / n / 255 > 0.5) c.fillRect(x, y, b, b);
    }
  }
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
