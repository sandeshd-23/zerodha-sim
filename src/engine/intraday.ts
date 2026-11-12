import type { CandleBar, DepthLevel } from '../types/simulator.ts';

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundTick(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0.05;
  return Math.max(0.05, Math.round(price * 20) / 20);
}

export function stepIndexToTimeLabel(stepIndex: number): string {
  const clamped = Math.max(0, Math.min(74, stepIndex));
  const totalMinutes = 9 * 60 + 15 + clamped * 5;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function dateAndStepToUnix(dateStr: string, stepIndex: number): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const clamped = Math.max(0, Math.min(74, stepIndex));
  const totalMinutes = 9 * 60 + 15 + clamped * 5;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  // Store as UTC-aligned display timestamp so Lightweight Charts displays exact IST clock (09:15 - 15:25)
  return Math.floor(Date.UTC(y, m - 1, d, hh, mm, 0) / 1000);
}

/**
 * Deterministically synthesizes 75 five-minute intraday candles (09:15 to 15:25 IST)
 * strictly anchored to the historical daily Open, High, Low, Close, and Volume.
 */
export function synthesizeIntraday5mBars(
  symbol: string,
  dateStr: string,
  dailyOpen: number,
  dailyHigh: number,
  dailyLow: number,
  dailyClose: number,
  dailyVolume: number
): CandleBar[] {
  const N = 75;
  const rng = mulberry32(hashSeed(`${symbol}|${dateStr}`));
  const range = Math.max(0.05, dailyHigh - dailyLow);

  const bullish = dailyClose >= dailyOpen;
  const normalOrder = rng() < 0.74;
  const firstIsLow = bullish ? normalOrder : !normalOrder;

  const idx1 = 6 + Math.floor(rng() * 24); // bar 6..29
  const idx2 = 40 + Math.floor(rng() * 26); // bar 40..65

  const p1 = firstIsLow ? dailyLow : dailyHigh;
  const p2 = firstIsLow ? dailyHigh : dailyLow;

  const waypoints = [
    { idx: 0, val: dailyOpen },
    { idx: idx1, val: p1 },
    { idx: idx2, val: p2 },
    { idx: N, val: dailyClose },
  ];

  // Build N+1 boundary prices via Brownian bridge between waypoints
  const points = new Float64Array(N + 1);
  points[0] = dailyOpen;
  points[N] = dailyClose;

  for (let w = 0; w < waypoints.length - 1; w++) {
    const start = waypoints[w];
    const end = waypoints[w + 1];
    const span = end.idx - start.idx;
    points[start.idx] = start.val;
    points[end.idx] = end.val;

    if (span <= 1) continue;

    const rawNoise = new Float64Array(span + 1);
    rawNoise[0] = 0;
    for (let k = 1; k <= span; k++) {
      const stepNoise = (rng() - 0.5) * range * 0.22;
      rawNoise[k] = rawNoise[k - 1] + stepNoise;
    }
    const endDrift = rawNoise[span];
    for (let k = 1; k < span; k++) {
      const frac = k / span;
      const linear = start.val + frac * (end.val - start.val);
      const bridge = rawNoise[k] - frac * endDrift;
      const clamped = Math.min(dailyHigh, Math.max(dailyLow, linear + bridge));
      points[start.idx + k] = clamped;
    }
  }

  // U-shaped intraday volume weights
  const volWeights = new Float64Array(N);
  let weightSum = 0;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1; // -1 to +1
    const uShape = 0.55 + 1.15 * (x * x) + rng() * 0.45;
    volWeights[i] = uShape;
    weightSum += uShape;
  }

  const bars: CandleBar[] = [];
  for (let i = 0; i < N; i++) {
    const o = roundTick(points[i]);
    const c = i === N - 1 ? roundTick(dailyClose) : roundTick(points[i + 1]);
    const wickUp = rng() * range * 0.065;
    const wickDn = rng() * range * 0.065;
    let h = roundTick(Math.min(dailyHigh, Math.max(o, c) + wickUp));
    let l = roundTick(Math.max(dailyLow, Math.min(o, c) - wickDn));

    if (i === idx1) {
      if (firstIsLow) l = roundTick(dailyLow);
      else h = roundTick(dailyHigh);
    }
    if (i === idx2) {
      if (firstIsLow) h = roundTick(dailyHigh);
      else l = roundTick(dailyLow);
    }

    bars.push({
      time: dateAndStepToUnix(dateStr, i),
      open: i === 0 ? roundTick(dailyOpen) : o,
      high: Math.max(h, o, c),
      low: Math.min(l, o, c),
      close: c,
      volume: Math.round((dailyVolume * volWeights[i]) / weightSum),
    });
  }

  return bars;
}

export function aggregateIntradayBars(bars5m: CandleBar[], groupSize: number): CandleBar[] {
  if (groupSize <= 1) return bars5m;
  const result: CandleBar[] = [];
  for (let i = 0; i < bars5m.length; i += groupSize) {
    const slice = bars5m.slice(i, i + groupSize);
    if (slice.length === 0) continue;
    let high = slice[0].high;
    let low = slice[0].low;
    let vol = 0;
    for (const b of slice) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      vol += b.volume;
    }
    result.push({
      time: slice[0].time,
      open: slice[0].open,
      high,
      low,
      close: slice[slice.length - 1].close,
      volume: vol,
    });
  }
  return result;
}

/**
 * Generates realistic 5-level NSE/BSE Limit Order Book (Market Depth) around current LTP.
 */
export function generateMarketDepth(
  symbol: string,
  dateStr: string,
  stepIndex: number,
  ltp: number,
  dailyVolume: number,
  isIndex: boolean
): { bids: DepthLevel[]; asks: DepthLevel[]; totalBidQty: number; totalAskQty: number } {
  if (isIndex || ltp <= 0) {
    return { bids: [], asks: [], totalBidQty: 0, totalAskQty: 0 };
  }

  const rng = mulberry32(hashSeed(`DEPTH|${symbol}|${dateStr}|${stepIndex}`));
  const tick = ltp >= 1000 ? 0.1 : 0.05;
  const baseQty = Math.max(25, Math.min(25000, Math.round((dailyVolume || 50000) / 1800)));

  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];
  let totalBidQty = 0;
  let totalAskQty = 0;

  for (let lvl = 1; lvl <= 5; lvl++) {
    const bidPrice = roundTick(Math.max(0.05, ltp - tick * lvl));
    const askPrice = roundTick(ltp + tick * lvl);
    const bidOrders = Math.max(1, Math.round(2 + rng() * 18 * lvl));
    const askOrders = Math.max(1, Math.round(2 + rng() * 18 * lvl));
    const bidQty = Math.max(1, Math.round(baseQty * (0.4 + rng() * 1.6) * (1 + lvl * 0.25)));
    const askQty = Math.max(1, Math.round(baseQty * (0.4 + rng() * 1.6) * (1 + lvl * 0.25)));

    bids.push({ price: bidPrice, orders: bidOrders, qty: bidQty });
    asks.push({ price: askPrice, orders: askOrders, qty: askQty });
  }

  totalBidQty = Math.round(bids.reduce((acc, b) => acc + b.qty, 0) * (8 + rng() * 12));
  totalAskQty = Math.round(asks.reduce((acc, a) => acc + a.qty, 0) * (8 + rng() * 12));

  return { bids, asks, totalBidQty, totalAskQty };
}
