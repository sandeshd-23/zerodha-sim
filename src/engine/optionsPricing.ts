import type { FuturesContractQuote, OptionContractQuote } from '../types/simulator.ts';
import { roundTick } from './intraday.ts';

const RISK_FREE_RATE = 0.065; // 6.5% RBI Repo/T-Bill benchmark

function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesResult {
  price: number;
  delta: number;
  /** Premium decay per calendar day (₹). */
  theta: number;
  /** Delta change per ₹1 move of the underlying. */
  gamma: number;
  /** Premium change (₹) per 1 volatility point (1%). */
  vega: number;
}

export function blackScholes(
  spot: number,
  strike: number,
  timeYears: number,
  vol: number,
  type: 'CE' | 'PE'
): BlackScholesResult {
  if (spot <= 0 || strike <= 0) return { price: 0.05, delta: 0, theta: 0, gamma: 0, vega: 0 };
  if (timeYears <= 1 / 1440) {
    const intrinsic = type === 'CE' ? Math.max(0.05, spot - strike) : Math.max(0.05, strike - spot);
    const delta = type === 'CE' ? (spot > strike ? 1 : 0) : spot < strike ? -1 : 0;
    return { price: roundTick(intrinsic), delta, theta: 0, gamma: 0, vega: 0 };
  }

  const sigma = Math.max(0.08, vol);
  const sqrtT = Math.sqrt(timeYears);
  const d1 = (Math.log(spot / strike) + (RISK_FREE_RATE + 0.5 * sigma * sigma) * timeYears) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discount = Math.exp(-RISK_FREE_RATE * timeYears);

  let price: number;
  let delta: number;
  let thetaAnnual: number;

  if (type === 'CE') {
    price = spot * normCdf(d1) - strike * discount * normCdf(d2);
    delta = normCdf(d1);
    thetaAnnual =
      -(spot * normPdf(d1) * sigma) / (2 * sqrtT) - RISK_FREE_RATE * strike * discount * normCdf(d2);
  } else {
    price = strike * discount * normCdf(-d2) - spot * normCdf(-d1);
    delta = normCdf(d1) - 1;
    thetaAnnual =
      -(spot * normPdf(d1) * sigma) / (2 * sqrtT) + RISK_FREE_RATE * strike * discount * normCdf(-d2);
  }
  const gamma = normPdf(d1) / (spot * sigma * sqrtT);
  const vega = (spot * normPdf(d1) * sqrtT) / 100;

  return {
    price: roundTick(Math.max(0.05, price)),
    delta: Number(delta.toFixed(2)),
    theta: Number((thetaAnnual / 365).toFixed(2)),
    gamma: Number(gamma.toPrecision(3)),
    vega: Number(vega.toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
// Expiry calendar
// ---------------------------------------------------------------------------
//
// Simplified, historically-reasonable NSE/BSE expiry rules (holidays are ignored:
// if an expiry falls on a market holiday we simply keep that weekday):
//
//  * Monthly expiry (stocks, futures, and index monthlies): last Thursday of the
//    month; from 2025-09-01 (SEBI/NSE change) the last Tuesday. For an index that
//    has a weekly series active at month end, the monthly is the LAST weekly of the
//    month (e.g. SENSEX monthlies fall on its weekly weekday).
//  * Weekly index options (in addition to monthlies):
//      - NIFTY BANK: Thursday from 2016-05-27, Wednesday from 2023-09-04,
//        discontinued from 2024-11-20 (SEBI: one weekly index per exchange).
//      - NIFTY 50:   Thursday from 2019-02-11, Tuesday from 2025-09-01.
//      - SENSEX:     Friday from 2023-05-15, Tuesday from 2025-01-01,
//        Thursday from 2025-09-01.
//      - Any other index (FINNIFTY, MIDCAP...): Thursday from 2019-02-11 until
//        2024-11-19, then monthly only.
//  * Stock options and ALL futures are monthly only.
//
// The contractKey embeds the expiry date ('SYM|YYYY-MM-DD|STRIKE|CE'), so pricing
// (priceDerivativeContractKey) never needs to know whether a contract is weekly.

const WEEKDAY = { TUE: 2, WED: 3, THU: 4, FRI: 5 } as const;

type WeeklyRule = { from: string; to?: string; weekday: number };

const WEEKLY_RULES: Record<string, WeeklyRule[]> = {
  'NIFTY BANK': [
    { from: '2016-05-27', to: '2023-09-03', weekday: WEEKDAY.THU },
    { from: '2023-09-04', to: '2024-11-19', weekday: WEEKDAY.WED },
  ],
  'NIFTY 50': [
    { from: '2019-02-11', to: '2025-08-31', weekday: WEEKDAY.THU },
    { from: '2025-09-01', weekday: WEEKDAY.TUE },
  ],
  SENSEX: [
    { from: '2023-05-15', to: '2024-12-31', weekday: WEEKDAY.FRI },
    { from: '2025-01-01', to: '2025-08-31', weekday: WEEKDAY.TUE },
    { from: '2025-09-01', weekday: WEEKDAY.THU },
  ],
};
const OTHER_INDEX_WEEKLY: WeeklyRule[] = [{ from: '2019-02-11', to: '2024-11-19', weekday: WEEKDAY.THU }];

/** Heuristic index detection (used when the caller does not pass isIndex). */
export function looksLikeIndex(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.startsWith('NIFTY') || s === 'SENSEX' || s === 'BANKEX' || s.startsWith('S&P BSE') || s.startsWith('BSE ');
}

function weeklyWeekdayOn(symbol: string, isIndex: boolean, date: string): number | null {
  if (!isIndex) return null;
  const rules = WEEKLY_RULES[symbol] || OTHER_INDEX_WEEKLY;
  for (const r of rules) {
    if (date >= r.from && (!r.to || date <= r.to)) return r.weekday;
  }
  return null;
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastWeekdayOfMonth(year: number, monthZeroIndexed: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, monthZeroIndexed + 1, 0));
  while (lastDay.getUTCDay() !== weekday) lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return isoOf(lastDay);
}

function monthlyExpiryFor(symbol: string, isIndex: boolean, year: number, monthZeroIndexed: number): string {
  const monthEnd = isoOf(new Date(Date.UTC(year, monthZeroIndexed + 1, 0)));
  const weekly = weeklyWeekdayOn(symbol, isIndex, monthEnd);
  const defaultWd = monthEnd >= '2025-09-01' ? WEEKDAY.TUE : WEEKDAY.THU;
  return lastWeekdayOfMonth(year, monthZeroIndexed, weekly ?? defaultWd);
}

/** Next `count` monthly expiries on/after simDate. */
export function getMonthlyExpiries(simDate: string, count = 3, symbol = '', isIndex = false): string[] {
  const dt = new Date(simDate + 'T00:00:00Z');
  let y = dt.getUTCFullYear();
  let m = dt.getUTCMonth();
  const out: string[] = [];
  while (out.length < count) {
    const exp = monthlyExpiryFor(symbol, isIndex, y, m);
    if (exp >= simDate) out.push(exp);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** Back-compat helper: the near and next monthly expiries. */
export function getActiveMonthlyExpiries(simDate: string): [string, string] {
  const [a, b] = getMonthlyExpiries(simDate, 2);
  return [a, b];
}

/** Next `count` weekly expiries on/after simDate (empty for stocks / when no weekly series existed). */
export function getWeeklyExpiries(symbol: string, isIndex: boolean, simDate: string, count = 4): string[] {
  const out: string[] = [];
  if (!isIndex) return out;
  const d = new Date(simDate + 'T00:00:00Z');
  for (let i = 0; i < 70 && out.length < count; i++) {
    const iso = isoOf(d);
    const wd = weeklyWeekdayOn(symbol, isIndex, iso);
    if (wd !== null && d.getUTCDay() === wd) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface ExpiryInfo {
  date: string;
  kind: 'W' | 'M';
  daysToExpiry: number;
}

/** All option expiries for an underlying on simDate (weeklies + monthlies), sorted. */
export function getOptionExpiries(symbol: string, simDate: string, isIndex = looksLikeIndex(symbol)): ExpiryInfo[] {
  const monthlies = getMonthlyExpiries(simDate, 3, symbol, isIndex);
  const weeklies = getWeeklyExpiries(symbol, isIndex, simDate, 4);
  const monthlySet = new Set(monthlies);
  // Keep the 3 monthlies + up to 4 weeklies, but don't show weeklies past the 2nd monthly.
  const all = Array.from(new Set([...weeklies.filter((w) => w <= monthlies[1]), ...monthlies])).sort();
  return all.map((date) => ({
    date,
    kind: monthlySet.has(date) ? 'M' : 'W',
    daysToExpiry: daysBetween(simDate, date),
  }));
}

function daysBetween(simDate: string, expiryDate: string): number {
  const simMs = new Date(simDate + 'T00:00:00Z').getTime();
  const expMs = new Date(expiryDate + 'T00:00:00Z').getTime();
  return Math.round((expMs - simMs) / 86400000);
}

/** Year-fraction used for option pricing. Shared by chain and re-pricing so both always agree. */
function optionTimeYears(daysToExpiry: number): number {
  return Math.max(0.25 / 365, (Math.max(0, daysToExpiry) + 0.4) / 365);
}

/** Volatility smile / skew (OTM puts carry a higher IV). Shared by chain and re-pricing. */
function smileIv(spot: number, strike: number, annualizedVol: number): number {
  const moneyness = (strike - spot) / Math.max(1, spot);
  const skew = moneyness < 0 ? Math.abs(moneyness) * 0.35 : moneyness * 0.15;
  return Math.max(0.1, Math.min(1.4, annualizedVol + skew));
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatExpiryShort(expiryDate: string): string {
  const [y, m] = expiryDate.split('-').map(Number);
  return `${String(y).slice(2)}${MONTHS[(m - 1) % 12]}`;
}

/** Kite-like weekly label, e.g. '11MAR W' (masked by maskContractDisplay in blind mode). */
export function formatWeeklyExpiryShort(expiryDate: string): string {
  const [, m, d] = expiryDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')}${MONTHS[(m - 1) % 12]} W`;
}

export function getStrikeInterval(symbol: string, spot: number): number {
  if (symbol === 'NIFTY 50') return spot >= 12000 ? 100 : 50;
  if (symbol === 'NIFTY BANK' || symbol === 'SENSEX') return spot >= 25000 ? 200 : 100;
  if (spot < 50) return 1;
  if (spot < 120) return 2.5;
  if (spot < 300) return 5;
  if (spot < 750) return 10;
  if (spot < 1800) return 20;
  if (spot < 4500) return 50;
  if (spot < 12000) return 100;
  return 250;
}

/** Deterministic 0..1 pseudo-random from a string seed (FNV-1a + xorshift). */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

export function generateSyntheticDerivatives(params: {
  symbol: string;
  spot: number;
  prevClose: number;
  annualizedVol: number;
  lotSize: number;
  simDate: string;
  expiryDate?: string;
  /** Optional: pass the instrument's isIndex flag; otherwise detected from the symbol. */
  isIndex?: boolean;
}): {
  expiries: string[];
  expiryInfo: ExpiryInfo[];
  selectedExpiry: string;
  futures: FuturesContractQuote[];
  options: OptionContractQuote[];
  atmStrike: number;
} {
  const isIndex = params.isIndex ?? looksLikeIndex(params.symbol);
  const lot = Math.max(1, params.lotSize);
  const expiryInfo = getOptionExpiries(params.symbol, params.simDate, isIndex);
  const expiries = expiryInfo.map((e) => e.date);
  // Accept any valid expiry date for the underlying (even one beyond the listed set) so
  // a deep link to an existing position's expiry still opens that chain.
  const requested = params.expiryDate;
  const farMonthlies = getMonthlyExpiries(params.simDate, 6, params.symbol, isIndex);
  const farWeeklies = getWeeklyExpiries(params.symbol, isIndex, params.simDate, 12);
  const selectedExpiry =
    requested && (expiries.includes(requested) || farMonthlies.includes(requested) || farWeeklies.includes(requested))
      ? requested
      : expiries[0];
  const isWeekly = !farMonthlies.includes(selectedExpiry);

  // Futures: monthly only (near / next / far).
  const futures: FuturesContractQuote[] = getMonthlyExpiries(params.simDate, 3, params.symbol, isIndex).map((exp) => {
    const daysToExpiry = Math.max(0, daysBetween(params.simDate, exp));
    const ltp = roundTick(params.spot * Math.exp(RISK_FREE_RATE * (daysToExpiry / 365)));
    const basis = Number((ltp - params.spot).toFixed(2));
    return {
      contractKey: `${params.symbol}|${exp}|FUT`,
      displaySymbol: `${params.symbol} ${formatExpiryShort(exp)} FUT`,
      expiryDate: exp,
      daysToExpiry,
      lotSize: lot,
      ltp,
      basis,
      marginRequired: Math.round(ltp * lot * 0.18),
    };
  });

  const step = getStrikeInterval(params.symbol, params.spot);
  const atmStrike = Math.round(params.spot / step) * step;
  const daysToExpiry = Math.max(0, daysBetween(params.simDate, selectedExpiry));
  const T = optionTimeYears(daysToExpiry);
  const prevT = T + 1 / 365;
  const shortExp = isWeekly ? formatWeeklyExpiryShort(selectedExpiry) : formatExpiryShort(selectedExpiry);
  const prevSpot = params.prevClose || params.spot;
  // Weeklies near expiry trade far more volume relative to OI.
  const volumeMult = isWeekly ? 2.2 : 1;

  const options: OptionContractQuote[] = [];
  for (let offset = -10; offset <= 10; offset++) {
    const strike = Number((atmStrike + offset * step).toFixed(2));
    if (strike <= 0) continue;

    const iv = smileIv(params.spot, strike, params.annualizedVol);
    const prevIv = smileIv(prevSpot, strike, params.annualizedVol);

    const ceNow = blackScholes(params.spot, strike, T, iv, 'CE');
    const peNow = blackScholes(params.spot, strike, T, iv, 'PE');
    const cePrev = blackScholes(prevSpot, strike, prevT, prevIv, 'CE');
    const pePrev = blackScholes(prevSpot, strike, prevT, prevIv, 'PE');

    // Synthetic OI: call writers cluster above spot, put writers below (like real chains).
    const seedBase = `${params.symbol}|${params.simDate}|${selectedExpiry}|${strike}`;
    const rCe = seeded(seedBase + '|CE');
    const rPe = seeded(seedBase + '|PE');
    const rCeChg = seeded(seedBase + '|CEchg');
    const rPeChg = seeded(seedBase + '|PEchg');
    const rCeVol = seeded(seedBase + '|CEvol');
    const rPeVol = seeded(seedBase + '|PEvol');
    const ceCentre = offset - 2;
    const peCentre = offset + 2;
    const roundStrikeBoost = strike % (step * 5) === 0 ? 1.35 : 1;
    const ceContracts = Math.round(9000 * Math.exp(-Math.abs(ceCentre) * 0.28) * (0.7 + 0.6 * rCe) * roundStrikeBoost);
    const peContracts = Math.round(9000 * Math.exp(-Math.abs(peCentre) * 0.28) * (0.7 + 0.6 * rPe) * roundStrikeBoost);
    const ceOi = ceContracts * lot;
    const peOi = peContracts * lot;
    // OI change: writers add on the side the market moved away from.
    const move = (params.spot - prevSpot) / Math.max(1, prevSpot);
    const ceChgPct = (rCeChg - 0.45) * 0.3 - move * 4;
    const peChgPct = (rPeChg - 0.45) * 0.3 + move * 4;
    const ceOiChange = Math.round(ceContracts * ceChgPct) * lot;
    const peOiChange = Math.round(peContracts * peChgPct) * lot;
    const ceVolume = Math.round(ceContracts * (0.6 + 1.8 * rCeVol) * volumeMult * Math.exp(-Math.abs(offset) * 0.12)) * lot;
    const peVolume = Math.round(peContracts * (0.6 + 1.8 * rPeVol) * volumeMult * Math.exp(-Math.abs(offset) * 0.12)) * lot;

    options.push({
      strike,
      expiryDate: selectedExpiry,
      daysToExpiry,
      lotSize: lot,
      isWeeklyExpiry: isWeekly,
      ce: {
        contractKey: `${params.symbol}|${selectedExpiry}|${strike}|CE`,
        displaySymbol: `${params.symbol} ${shortExp} ${strike} CE`,
        ltp: ceNow.price,
        iv: Number((iv * 100).toFixed(1)),
        delta: ceNow.delta,
        theta: ceNow.theta,
        gamma: ceNow.gamma,
        vega: ceNow.vega,
        oi: ceOi,
        oiChange: ceOiChange,
        volume: ceVolume,
        changePct: cePrev.price > 0 ? Number((((ceNow.price - cePrev.price) / cePrev.price) * 100).toFixed(1)) : 0,
      },
      pe: {
        contractKey: `${params.symbol}|${selectedExpiry}|${strike}|PE`,
        displaySymbol: `${params.symbol} ${shortExp} ${strike} PE`,
        ltp: peNow.price,
        iv: Number((iv * 100).toFixed(1)),
        delta: peNow.delta,
        theta: peNow.theta,
        gamma: peNow.gamma,
        vega: peNow.vega,
        oi: peOi,
        oiChange: peOiChange,
        volume: peVolume,
        changePct: pePrev.price > 0 ? Number((((peNow.price - pePrev.price) / pePrev.price) * 100).toFixed(1)) : 0,
      },
    });
  }

  return {
    expiries,
    expiryInfo,
    selectedExpiry,
    futures,
    options,
    atmStrike,
  };
}

/**
 * Re-prices any FUT / CE / PE contractKey (weekly or monthly) on any simulated date.
 * Uses exactly the same time-to-expiry, smile and Black-Scholes as the chain, so a
 * contract bought from the chain is marked at the same price the chain showed.
 * On the expiry day itself the contract still carries a little time value (it trades
 * until the close); the engine settles at `intrinsicValue` at that day's close.
 */
export function priceDerivativeContractKey(
  contractKey: string,
  spot: number,
  annualizedVol: number,
  simDate: string
): { ltp: number; expired: boolean; intrinsicValue: number } {
  const parts = contractKey.split('|');
  if (parts.length < 3 || spot <= 0) {
    return { ltp: 0.05, expired: false, intrinsicValue: 0 };
  }

  const expiryDate = parts[1];
  const daysToExpiry = daysBetween(simDate, expiryDate);
  const expired = simDate > expiryDate;

  if (parts[2] === 'FUT') {
    const ltp = expired ? roundTick(spot) : roundTick(spot * Math.exp(RISK_FREE_RATE * (Math.max(0, daysToExpiry) / 365)));
    return { ltp, expired, intrinsicValue: roundTick(spot) };
  }

  const strike = Number(parts[2]);
  const optType = parts[3] as 'CE' | 'PE';
  const intrinsic = optType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);

  if (expired) {
    return { ltp: roundTick(intrinsic), expired: true, intrinsicValue: Number(intrinsic.toFixed(2)) };
  }

  const iv = smileIv(spot, strike, annualizedVol);
  const bs = blackScholes(spot, strike, optionTimeYears(daysToExpiry), iv, optType);
  return { ltp: bs.price, expired: false, intrinsicValue: Number(intrinsic.toFixed(2)) };
}

/** Payoff (₹) of one option/future leg at expiry for an underlying price. qty is signed (+long / -short). */
export function legPayoffAtExpiry(
  leg: { instrumentType: 'CE' | 'PE' | 'FUT'; strike?: number; entryPrice: number; qty: number },
  underlyingAtExpiry: number
): number {
  let value: number;
  if (leg.instrumentType === 'FUT') value = underlyingAtExpiry;
  else if (leg.instrumentType === 'CE') value = Math.max(0, underlyingAtExpiry - (leg.strike || 0));
  else value = Math.max(0, (leg.strike || 0) - underlyingAtExpiry);
  return (value - leg.entryPrice) * leg.qty;
}
