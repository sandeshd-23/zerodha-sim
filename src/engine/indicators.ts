import type { CandleBar } from '../types/simulator.ts';

export interface LinePoint {
  time: string | number;
  value: number;
}

export function computeHeikinAshi(bars: CandleBar[]): CandleBar[] {
  if (bars.length === 0) return [];
  const out: CandleBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({
      time: b.time,
      open: Number(haOpen.toFixed(2)),
      high: Number(haHigh.toFixed(2)),
      low: Number(haLow.toFixed(2)),
      close: Number(haClose.toFixed(2)),
      volume: b.volume,
    });
  }
  return out;
}

export function computeSMA(bars: CandleBar[], period: number): LinePoint[] {
  if (bars.length < period || period <= 0) return [];
  const res: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) {
      res.push({ time: bars[i].time, value: Number((sum / period).toFixed(2)) });
    }
  }
  return res;
}

export function computeEMA(bars: CandleBar[], period: number): LinePoint[] {
  if (bars.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  const res: LinePoint[] = [];
  let ema = 0;
  for (let i = 0; i < period; i++) ema += bars[i].close;
  ema /= period;
  res.push({ time: bars[period - 1].time, value: Number(ema.toFixed(2)) });

  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    res.push({ time: bars[i].time, value: Number(ema.toFixed(2)) });
  }
  return res;
}

export function computeBollingerBands(
  bars: CandleBar[],
  period = 20,
  mult = 2
): { upper: LinePoint[]; middle: LinePoint[]; lower: LinePoint[] } {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  if (bars.length < period) return { upper, middle, lower };

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (bars[j].close - mean) ** 2;
    const std = Math.sqrt(sq / period);
    const t = bars[i].time;
    middle.push({ time: t, value: Number(mean.toFixed(2)) });
    upper.push({ time: t, value: Number((mean + mult * std).toFixed(2)) });
    lower.push({ time: t, value: Number(Math.max(0.05, mean - mult * std).toFixed(2)) });
  }
  return { upper, middle, lower };
}

export function computeVWAP(bars: CandleBar[], rollingPeriod = 20): LinePoint[] {
  if (bars.length === 0) return [];
  const isIntraday = typeof bars[0].time === 'number';
  const res: LinePoint[] = [];

  if (isIntraday) {
    let currentDay = -1;
    let cumPV = 0;
    let cumV = 0;
    for (const b of bars) {
      const dayBucket = Math.floor(Number(b.time) / 86400);
      if (dayBucket !== currentDay) {
        currentDay = dayBucket;
        cumPV = 0;
        cumV = 0;
      }
      const tp = (b.high + b.low + b.close) / 3;
      const v = Math.max(1, b.volume);
      cumPV += tp * v;
      cumV += v;
      res.push({ time: b.time, value: Number((cumPV / cumV).toFixed(2)) });
    }
    return res;
  }

  // Rolling 20-bar VWAP for Daily/Weekly/Monthly
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - rollingPeriod + 1);
    let pv = 0;
    let vv = 0;
    for (let j = start; j <= i; j++) {
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
      const v = Math.max(1, bars[j].volume);
      pv += tp * v;
      vv += v;
    }
    res.push({ time: bars[i].time, value: Number((pv / vv).toFixed(2)) });
  }
  return res;
}

export function computeSupertrend(
  bars: CandleBar[],
  period = 10,
  multiplier = 3
): Array<{ time: string | number; value: number; color: string }> {
  if (bars.length <= period) return [];

  const tr = new Float64Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr[i] = bars[i].high - bars[i].low;
    } else {
      const hl = bars[i].high - bars[i].low;
      const hc = Math.abs(bars[i].high - bars[i - 1].close);
      const lc = Math.abs(bars[i].low - bars[i - 1].close);
      tr[i] = Math.max(hl, hc, lc);
    }
  }

  const atr = new Float64Array(bars.length);
  let sumTr = 0;
  for (let i = 0; i < period; i++) sumTr += tr[i];
  atr[period - 1] = sumTr / period;
  for (let i = period; i < bars.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  const finalUpper = new Float64Array(bars.length);
  const finalLower = new Float64Array(bars.length);
  const supertrend = new Float64Array(bars.length);
  const dir = new Int8Array(bars.length); // 1 bullish, -1 bearish

  const out: Array<{ time: string | number; value: number; color: string }> = [];

  for (let i = period - 1; i < bars.length; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];

    if (i === period - 1) {
      finalUpper[i] = basicUpper;
      finalLower[i] = basicLower;
      dir[i] = 1;
      supertrend[i] = finalLower[i];
    } else {
      finalUpper[i] =
        basicUpper < finalUpper[i - 1] || bars[i - 1].close > finalUpper[i - 1]
          ? basicUpper
          : finalUpper[i - 1];
      finalLower[i] =
        basicLower > finalLower[i - 1] || bars[i - 1].close < finalLower[i - 1]
          ? basicLower
          : finalLower[i - 1];

      if (dir[i - 1] === -1 && bars[i].close > finalUpper[i - 1]) {
        dir[i] = 1;
      } else if (dir[i - 1] === 1 && bars[i].close < finalLower[i - 1]) {
        dir[i] = -1;
      } else {
        dir[i] = dir[i - 1];
      }
      supertrend[i] = dir[i] === 1 ? finalLower[i] : finalUpper[i];
    }

    out.push({
      time: bars[i].time,
      value: Number(Math.max(0.05, supertrend[i]).toFixed(2)),
      color: dir[i] === 1 ? '#4caf50' : '#df514c',
    });
  }

  return out;
}

export function computeRSI(bars: CandleBar[], period = 14): LinePoint[] {
  if (bars.length <= period) return [];
  const out: LinePoint[] = [];

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out.push({
    time: bars[period].time,
    value: Number((avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRs)).toFixed(2)),
  });

  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: bars[i].time, value: Number(rsi.toFixed(2)) });
  }
  return out;
}

export function computeMACD(
  bars: CandleBar[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: Array<{ time: string | number; value: number; color: string }>;
} {
  if (bars.length < slowPeriod + signalPeriod) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fastEma = computeEMA(bars, fastPeriod);
  const slowEma = computeEMA(bars, slowPeriod);
  const offset = slowPeriod - fastPeriod;

  const macdRaw: Array<{ time: string | number; close: number }> = [];
  for (let i = 0; i < slowEma.length; i++) {
    const val = fastEma[i + offset].value - slowEma[i].value;
    macdRaw.push({ time: slowEma[i].time, close: val });
  }

  // Compute EMA of macdRaw for signal line
  const k = 2 / (signalPeriod + 1);
  let sig = 0;
  for (let i = 0; i < signalPeriod; i++) sig += macdRaw[i].close;
  sig /= signalPeriod;

  const macd: LinePoint[] = [];
  const signal: LinePoint[] = [];
  const histogram: Array<{ time: string | number; value: number; color: string }> = [];

  for (let i = signalPeriod - 1; i < macdRaw.length; i++) {
    if (i > signalPeriod - 1) {
      sig = macdRaw[i].close * k + sig * (1 - k);
    }
    const mVal = Number(macdRaw[i].close.toFixed(2));
    const sVal = Number(sig.toFixed(2));
    const hVal = Number((mVal - sVal).toFixed(2));
    macd.push({ time: macdRaw[i].time, value: mVal });
    signal.push({ time: macdRaw[i].time, value: sVal });
    histogram.push({
      time: macdRaw[i].time,
      value: hVal,
      color: hVal >= 0 ? 'rgba(76, 175, 80, 0.7)' : 'rgba(223, 81, 76, 0.7)',
    });
  }

  return { macd, signal, histogram };
}
