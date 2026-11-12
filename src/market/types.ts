import type { DividendEvent, Instrument, SplitEvent } from '../types/simulator.ts';

/** Price columns may be Float32 (static offline data) or Float64 (SQLite). Values are identical. */
export type PriceArray = Float64Array | Float32Array;
export type VolumeArray = Float64Array | Uint32Array | Float32Array;

export interface SymbolSeries {
  instrument: Instrument;
  dates: string[];
  opens: PriceArray;
  highs: PriceArray;
  lows: PriceArray;
  closes: PriceArray;
  volumes: VolumeArray;
  splits: SplitEvent[];
  dividends: Array<{ date: string; yahooAmount: number }>;
}

/** Raw columnar bars for one symbol as delivered by a data source. */
export interface SeriesColumns {
  dates: string[];
  opens: PriceArray;
  highs: PriceArray;
  lows: PriceArray;
  closes: PriceArray;
  volumes: VolumeArray;
}

export interface DayStepBar {
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  volume: number;
  annualizedVol: number;
}

export interface DayStepPacket {
  date: string;
  niftyClose: number;
  bars: Record<string, DayStepBar>;
  splits: SplitEvent[];
  dividends: DividendEvent[];
}

export interface MarketMovers {
  gainers: Array<{ symbol: string; name: string; sector: string; ltp: number; changePct: number }>;
  losers: Array<{ symbol: string; name: string; sector: string; ltp: number; changePct: number }>;
  breakouts52w: Array<{ symbol: string; name: string; ltp: number; high52w: number; changePct: number }>;
  sectors: Array<{ sector: string; avgChangePct: number; count: number }>;
}

export interface HistoricalEra {
  id: string;
  label: string;
  date: string;
  description: string;
}

export interface CorporateActions {
  splits: SplitEvent[];
  dividends: Array<{ symbol: string; date: string; amount: number }>;
}

export interface DataCapabilities {
  /** Yahoo remote search + sync of brand-new tickers (needs the PC server). */
  remoteSearch: boolean;
  addTicker: boolean;
  liveSync: boolean;
}
