import type { Instrument } from '../types/simulator.ts';
import type { CorporateActions, DataCapabilities, MarketMovers, SeriesColumns } from './types.ts';

export interface Catalog {
  /** Instruments that have bar data, with firstDate/lastDate filled in. */
  instruments: Instrument[];
  /** Latest bar date in the dataset. */
  dataAsOf?: string;
}

/**
 * Where the market engine gets its data from.
 * - Node (PC server / exporter): SQLite.
 * - Browser (offline PWA): static files under /data, cached in Cache Storage.
 */
export interface MarketDataSource {
  readonly capabilities: DataCapabilities;
  loadCatalog(): Promise<Catalog>;
  loadActions(): Promise<CorporateActions>;
  loadSeries(symbols: string[]): Promise<Map<string, SeriesColumns>>;
  /** Precomputed market movers for every trading date of a year (optional). */
  loadMoversYear?(year: number): Promise<Map<string, MarketMovers> | null>;
}
