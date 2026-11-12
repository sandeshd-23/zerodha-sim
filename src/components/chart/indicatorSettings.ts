import { readLocal, writeLocal } from './useIsPhone.ts';

export interface IndicatorParams {
  sma1: number;
  sma2: number;
  sma3: number;
  ema: number;
  bbLength: number;
  bbStdDev: number;
  vwapLength: number;
  rsiLength: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  stPeriod: number;
  stMultiplier: number;
}

export const DEFAULT_INDICATOR_PARAMS: IndicatorParams = {
  sma1: 20,
  sma2: 50,
  sma3: 200,
  ema: 21,
  bbLength: 20,
  bbStdDev: 2,
  vwapLength: 20,
  rsiLength: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stPeriod: 10,
  stMultiplier: 3,
};

export type OverlayKey = 'SMA1' | 'SMA2' | 'SMA3' | 'EMA' | 'BB' | 'VWAP' | 'SUPERTREND';
export type OscillatorPane = 'NONE' | 'RSI' | 'MACD';

export const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  SMA1: true,
  SMA2: false,
  SMA3: true,
  EMA: false,
  BB: false,
  VWAP: false,
  SUPERTREND: false,
};

const PARAMS_KEY = 'kite.chart.indicatorParams';
const OVERLAYS_KEY = 'kite.chart.overlays';
const OSC_KEY = 'kite.chart.oscillator';

function sanitize(p: IndicatorParams): IndicatorParams {
  const int = (v: number, min: number, max: number, d: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
  const num = (v: number, min: number, max: number, d: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  const D = DEFAULT_INDICATOR_PARAMS;
  return {
    sma1: int(p.sma1, 2, 500, D.sma1),
    sma2: int(p.sma2, 2, 500, D.sma2),
    sma3: int(p.sma3, 2, 500, D.sma3),
    ema: int(p.ema, 2, 500, D.ema),
    bbLength: int(p.bbLength, 2, 300, D.bbLength),
    bbStdDev: num(p.bbStdDev, 0.5, 5, D.bbStdDev),
    vwapLength: int(p.vwapLength, 2, 300, D.vwapLength),
    rsiLength: int(p.rsiLength, 2, 100, D.rsiLength),
    macdFast: int(p.macdFast, 2, 100, D.macdFast),
    macdSlow: int(p.macdSlow, 3, 200, D.macdSlow),
    macdSignal: int(p.macdSignal, 2, 100, D.macdSignal),
    stPeriod: int(p.stPeriod, 2, 100, D.stPeriod),
    stMultiplier: num(p.stMultiplier, 0.5, 10, D.stMultiplier),
  };
}

export function loadIndicatorParams(): IndicatorParams {
  return sanitize(readLocal(PARAMS_KEY, DEFAULT_INDICATOR_PARAMS));
}
export function saveIndicatorParams(p: IndicatorParams): IndicatorParams {
  const clean = sanitize(p);
  writeLocal(PARAMS_KEY, clean);
  return clean;
}
export function loadOverlays(): Record<OverlayKey, boolean> {
  return readLocal(OVERLAYS_KEY, DEFAULT_OVERLAYS);
}
export function saveOverlays(o: Record<OverlayKey, boolean>): void {
  writeLocal(OVERLAYS_KEY, o);
}
export function loadOscillator(): OscillatorPane {
  try {
    const v = window.localStorage.getItem(OSC_KEY);
    return v === 'RSI' || v === 'MACD' ? v : 'NONE';
  } catch {
    return 'NONE';
  }
}
export function saveOscillator(o: OscillatorPane): void {
  writeLocal(OSC_KEY, o);
}

/** Field definitions for the settings popover (label, tip, step). */
export const PARAM_FIELDS: Record<
  OverlayKey | 'RSI' | 'MACD',
  Array<{ key: keyof IndicatorParams; label: string; step?: number }>
> = {
  SMA1: [{ key: 'sma1', label: 'Length' }],
  SMA2: [{ key: 'sma2', label: 'Length' }],
  SMA3: [{ key: 'sma3', label: 'Length' }],
  EMA: [{ key: 'ema', label: 'Length' }],
  BB: [
    { key: 'bbLength', label: 'Length' },
    { key: 'bbStdDev', label: 'Std dev', step: 0.1 },
  ],
  VWAP: [{ key: 'vwapLength', label: 'Rolling bars (D/W/M)' }],
  SUPERTREND: [
    { key: 'stPeriod', label: 'ATR period' },
    { key: 'stMultiplier', label: 'Multiplier', step: 0.1 },
  ],
  RSI: [{ key: 'rsiLength', label: 'Length' }],
  MACD: [
    { key: 'macdFast', label: 'Fast' },
    { key: 'macdSlow', label: 'Slow' },
    { key: 'macdSignal', label: 'Signal' },
  ],
};

export const OVERLAY_META: Record<OverlayKey, { color: string; label: (p: IndicatorParams) => string; tip: string }> = {
  SMA1: {
    color: '#387ed1',
    label: (p) => `SMA ${p.sma1}`,
    tip: 'Simple Moving Average (fast) :: The average closing price of the last N bars, drawn as a smooth line. Price above a rising SMA = uptrend. :: 20 is popular for short-term trends; change the length in settings.',
  },
  SMA2: {
    color: '#f59e0b',
    label: (p) => `SMA ${p.sma2}`,
    tip: 'Simple Moving Average (medium) :: Average close of the last N bars — 50 is the classic medium-term trend line. :: Watch for price bouncing off it in healthy uptrends.',
  },
  SMA3: {
    color: '#a855f7',
    label: (p) => `SMA ${p.sma3}`,
    tip: 'Simple Moving Average (slow) :: The 200-bar SMA is the long-term trend line big investors watch. :: 50 crossing above 200 = “golden cross” (bullish); below = “death cross”.',
  },
  EMA: {
    color: '#06b6d4',
    label: (p) => `EMA ${p.ema}`,
    tip: 'Exponential Moving Average :: Like an SMA but gives more weight to recent prices, so it reacts faster to new moves. :: Swing traders often use 9/21 EMAs.',
  },
  BB: {
    color: '#3b82f6',
    label: (p) => `BB ${p.bbLength},${p.bbStdDev}`,
    tip: 'Bollinger Bands :: A moving average with bands N standard deviations above and below. Bands widen when volatility rises and squeeze when it falls. :: A tight “squeeze” often comes before a big move.',
  },
  VWAP: {
    color: '#ec4899',
    label: () => 'VWAP',
    tip: 'VWAP (Volume-Weighted Average Price) :: Average price weighted by volume — intraday it resets every session. Institutions use it as a fair-value benchmark. :: Price above VWAP = buyers in control for the day.',
  },
  SUPERTREND: {
    color: '#10b981',
    label: (p) => `Supertrend ${p.stPeriod},${p.stMultiplier}`,
    tip: 'Supertrend :: A trend-following line based on ATR (average true range). Green below price = uptrend, red above price = downtrend. :: Many traders use it as a trailing stop-loss.',
  },
};
