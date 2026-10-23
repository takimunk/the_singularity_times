// The front page's lower flow is set like type in CSS columns. The browser balances them, but unbreakable items
// (a post, a brief, the interview) leave ragged bottoms. This pass finishes the job the way a compositor would:
// rules at the top of a column are dropped, the flow height is frozen, and each short column is vertically
// justified by spreading its shortfall between its items. Without JS the plain CSS columns still read fine.

const TOP = 'coltop';

/** Items that can sit at the top of a column and the units that take extra space above them. */
function units(flow: HTMLElement) {
  const sections = [...flow.children] as HTMLElement[];
  const leaves = sections.flatMap((s) => [...s.querySelectorAll<HTMLElement>(':scope li, :scope figure')]);
  return { sections, leaves };
}

const col = (r: DOMRect, left: number, width: number, n: number) =>
  Math.min(n - 1, Math.max(0, Math.floor((r.left - left + 1) / width)));

function reset(flow: HTMLElement) {
  flow.style.height = '';
  flow.style.columnFill = '';
  for (const el of flow.querySelectorAll<HTMLElement>('[data-vj]')) {
    el.style.marginTop = '';
    delete el.dataset.vj;
  }
  for (const el of flow.querySelectorAll<HTMLElement>(`.${TOP}`)) el.classList.remove(TOP);
}

export function justify(flow: HTMLElement) {
  reset(flow);
  const n = Number.parseInt(getComputedStyle(flow).columnCount, 10) || 1;
  if (n < 2) return;

  const { sections, leaves } = units(flow);
  const all = [...sections, ...leaves];
  const fr = flow.getBoundingClientRect();
  const padTop = Number.parseFloat(getComputedStyle(flow).paddingTop) || 0;
  const gap = Number.parseFloat(getComputedStyle(flow).columnGap) || 0;
  const colW = (fr.width + gap) / n;

  // Drop the rule above anything that opens a column; that can move items, so settle twice.
  for (let pass = 0; pass < 2; pass++) {
    const top = flow.getBoundingClientRect().top + padTop;
    for (const el of all) {
      if (el === sections[0]) continue;
      // A section split across columns has one rect per column; only its first one carries the rule.
      const r = el.getClientRects()[0];
      if (r && Math.abs(r.top - top) < 2) el.classList.add(TOP);
    }
  }

  // Freeze the balanced height so spacing changes can no longer move items between columns.
  const h = flow.getBoundingClientRect().height;
  flow.style.height = `${h}px`;
  flow.style.columnFill = 'auto';

  const box = flow.getBoundingClientRect();
  const bottom = box.top + h - (Number.parseFloat(getComputedStyle(flow).paddingBottom) || 0) - 1;
  const cols: { units: HTMLElement[]; end: number }[] = Array.from({ length: n }, () => ({ units: [], end: 0 }));
  for (const el of all) {
    const rects = [...el.getClientRects()];
    if (rects.length === 0) continue;
    // A section split across columns fills each column it touches, so only its items say where ink ends.
    const container = sections.includes(el) && el.querySelector('li, figure');
    for (const r of container ? [] : rects) {
      const k = cols[col(r, box.left, colW, n)];
      k.end = Math.max(k.end, r.bottom);
    }
    const c = cols[col(rects[0], box.left, colW, n)];
    // A section's first item travels with its header; the section itself takes the space instead.
    const first = el.matches('li:first-child, figure:first-of-type');
    if (!el.classList.contains(TOP) && !first && el !== sections[0]) c.units.push(el);
  }
  for (const c of cols) {
    const short = bottom - c.end;
    if (short < 4 || c.units.length === 0) continue;
    const each = short / c.units.length;
    for (const el of c.units) {
      el.dataset.vj = '';
      el.style.marginTop = `${(Number.parseFloat(getComputedStyle(el).marginTop) || 0) + each}px`;
    }
  }
}

export function mountFlow(flow: HTMLElement) {
  const run = () => justify(flow);
  run();
  document.fonts?.ready.then(run);
  addEventListener('load', run);
  let t: number | undefined;
  let w = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === w) return;
    w = innerWidth;
    clearTimeout(t);
    t = window.setTimeout(run, 120);
  });
}
