// Masthead ears: Coinbase spot prices and Polymarket odds, fetched in the browser, with deterministic demo data as fallback.
// Pure module (no window access at load) so the demo set can also be rendered at build time.
//
// Coinbase Exchange, GET /products/{id}/candles, public, no auth:
//   https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
//   granularity must be 60, 300, 900, 3600, 21600 or 86400 s; rows are [time, low, high, open, close, volume].
// Polymarket Gamma, GET /markets/slug/{slug}:
//   https://docs.polymarket.com/api-reference/markets/get-market-by-slug
//   outcomes, outcomePrices and clobTokenIds are JSON arrays encoded as strings.
// Polymarket CLOB, GET /prices-history?market={token id}&interval=1w&fidelity={minutes}:
//   https://docs.polymarket.com/api-reference/markets/get-prices-history
//   returns { history: [{ t, p }] }.

/** Same LCG as rng() in canvas.ts, copied because canvas.ts reads window at load and this runs at build time too. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const COINBASE = 'https://api.exchange.coinbase.com';
export const GAMMA = 'https://gamma-api.polymarket.com';
export const CLOB = 'https://clob.polymarket.com';

/** Default Polymarket markets while an issue names none: the three leading answers of
 *  "Which company has best AI model end of 2026?" (resolves 2026-12-31). */
export const DEFAULT_SLUGS = [
  'will-anthropic-have-the-best-ai-model-at-the-end-of-december-2026',
  'will-google-have-the-best-ai-model-at-the-end-of-december-2026',
  'will-openai-have-the-best-ai-model-at-the-end-of-december-2026',
];

export interface Coin {
  sym: string;
  /** Price history, oldest first; the last point is the current price. */
  h: number[];
  /** Price 24 h ago, for the change figure. */
  open: number;
}

export interface Market {
  q: string;
  /** Probability of "Yes", 0..100. */
  p: number;
  /** Probability history, 0..100, oldest first. */
  h: number[];
  url: string;
}

/* ---------- formatting, shared by build-time and live rendering ---------- */

export const fmtPrice = (p: number) =>
  p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4);

export function fmtChange(c: Coin) {
  const ch = (c.h[c.h.length - 1] / c.open - 1) * 100;
  const up = ch >= 0;
  return { up, text: (up ? '▲' : '▼') + Math.abs(ch).toFixed(2) + '%' };
}

export const fmtPct = (p: number) => (p < 1 ? '<1' : p > 99 ? '>99' : String(Math.round(p)));

/* ---------- demo data (the prototype's set, seeded so build and browser agree) ---------- */

const DEMO_PRICE: Record<string, [number, number]> = { BTC: [67420, 0.0016], ETH: [3180, 0.0022] };

export function demoCoins(syms: string[]): Coin[] {
  const r = rng(42);
  return syms.map((sym) => {
    const [p0, v] = DEMO_PRICE[sym] ?? [100, 0.003];
    const h: number[] = [];
    let p = p0 * (1 - 0.02 + r() * 0.04);
    for (let i = 0; i < 48; i++) {
      p *= 1 + (r() - 0.49) * v * 3;
      h.push(p);
    }
    return { sym, h, open: h[0] };
  });
}

export function demoMarkets(): Market[] {
  const set = [
    { q: 'Will a frontier lab announce a model it calls AGI before 2027?', p: 12 },
    { q: 'Will an AI system win an IMO gold medal under exam conditions in 2027?', p: 71 },
    { q: 'Will a fully AI-generated feature film get a wide cinema release in 2027?', p: 38 },
  ];
  const r = rng(7);
  return set.map((m) => {
    const h: number[] = [];
    let v = m.p + (r() - 0.5) * 20;
    for (let i = 0; i < 40; i++) {
      v += (m.p - v) * 0.08 + (r() - 0.5) * 5;
      h.push(Math.max(1, Math.min(99, v)));
    }
    h[39] = m.p;
    return { ...m, h, url: 'https://polymarket.com' };
  });
}

/* ---------- live data ---------- */

async function getJSON(url: string, ms = 8000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN);
const ok = (x: number) => Number.isFinite(x) && x > 0;

/** Last 24 h of 15-minute candles, thinned to 48 points (30 min apart). */
export async function fetchCoin(sym: string): Promise<Coin> {
  if (!/^[A-Z0-9]{2,10}$/.test(sym)) throw new Error('bad symbol');
  const raw = await getJSON(`${COINBASE}/products/${sym}-USD/candles?granularity=900`);
  if (!Array.isArray(raw)) throw new Error('candles: not an array');
  const rows = raw
    .filter((r): r is unknown[] => Array.isArray(r) && r.length >= 5)
    .map((r) => ({ t: num(r[0]), open: num(r[3]), close: num(r[4]) }))
    .filter((r) => Number.isFinite(r.t) && ok(r.open) && ok(r.close))
    .sort((a, b) => a.t - b.t);
  const last = rows[rows.length - 1];
  if (!last) throw new Error('candles: empty');
  const day = rows.filter((r) => r.t > last.t - 86400);
  if (day.length < 12) throw new Error('candles: too few');
  const h = day.filter((_, i) => (day.length - 1 - i) % 2 === 0).map((r) => r.close);
  return { sym, h, open: day[0].open };
}

function strArray(x: unknown): string[] | null {
  let v = x;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return Array.isArray(v) ? v.map(String) : null;
}

/** One binary market: question and current "Yes" probability, plus a week of history (best effort). */
export async function fetchMarket(slug: string): Promise<Market> {
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) throw new Error('bad slug');
  const m = (await getJSON(`${GAMMA}/markets/slug/${slug}`)) as Record<string, unknown> | null;
  if (!m || typeof m !== 'object' || typeof m.question !== 'string') throw new Error('market: no question');
  const outcomes = strArray(m.outcomes) ?? ['Yes', 'No'];
  const prices = strArray(m.outcomePrices);
  const tokens = strArray(m.clobTokenIds);
  const yes = Math.max(0, outcomes.findIndex((o) => o.toLowerCase() === 'yes'));
  const p = num(prices?.[yes]) * 100;
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error('market: no price');

  const events = Array.isArray(m.events) ? (m.events as Record<string, unknown>[]) : [];
  const ev = typeof events[0]?.slug === 'string' ? (events[0].slug as string) : '';
  const url = /^[a-z0-9-]+$/.test(ev) ? `https://polymarket.com/event/${ev}` : 'https://polymarket.com';

  let h = [p, p];
  const token = tokens?.[yes];
  if (token && /^\d+$/.test(token)) {
    try {
      const r = (await getJSON(`${CLOB}/prices-history?market=${token}&interval=1w&fidelity=180`)) as { history?: unknown };
      const pts = Array.isArray(r?.history)
        ? r.history.map((x) => num((x as { p?: unknown })?.p) * 100).filter((v) => Number.isFinite(v) && v >= 0 && v <= 100)
        : [];
      if (pts.length >= 2) h = [...pts, p];
    } catch {
      /* the price alone is still worth showing */
    }
  }
  return { q: m.question.trim(), p, h, url };
}

/** Runs fn now and every ms while the tab is visible; on return to the tab, runs at once if a refresh is due. */
export function poll(fn: () => Promise<void> | void, ms: number) {
  let last = 0;
  let timer: number | undefined;
  const run = async () => {
    clearTimeout(timer);
    last = Date.now();
    try {
      await fn();
    } finally {
      if (!document.hidden) timer = window.setTimeout(run, ms);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else {
      clearTimeout(timer);
      timer = window.setTimeout(run, Math.max(0, last + ms - Date.now()));
    }
  });
  run();
}
