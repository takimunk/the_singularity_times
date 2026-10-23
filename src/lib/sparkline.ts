// Masthead sparklines: a 1.2 px line, an optional light fill under it, and a dot on the last value.
import { DPR, fit } from './canvas';

export function spark(cv: HTMLCanvasElement, arr: number[], color: string, fill = false) {
  const [w, h] = fit(cv);
  const c = cv.getContext('2d');
  if (!c || arr.length < 2) return;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, w, h);
  const mn = Math.min(...arr), mx = Math.max(...arr), sx = (w - 3) / (arr.length - 1);
  const sy = (v: number) => h - 2 - ((v - mn) / (mx - mn || 1)) * (h - 4);
  const path = () => {
    c.beginPath();
    arr.forEach((v, i) => (i ? c.lineTo(i * sx, sy(v)) : c.moveTo(0, sy(v))));
  };
  c.strokeStyle = c.fillStyle = color;
  if (fill) {
    path();
    c.lineTo((arr.length - 1) * sx, h);
    c.lineTo(0, h);
    c.closePath();
    c.globalAlpha = 0.12;
    c.fill();
    c.globalAlpha = 1;
  }
  path();
  c.lineWidth = 1.2;
  c.stroke();
  c.beginPath();
  c.arc((arr.length - 1) * sx, sy(arr[arr.length - 1]), 1.8, 0, Math.PI * 2);
  c.fill();
}
