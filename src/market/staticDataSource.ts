/**
 * Market data from the static files written by scripts/exportData.ts (public/data/…).
 * Used by the offline PWA's Web Worker, and by Node parity checks (with an fs-based fetcher).
 */
import type { Instrument, SplitEvent } from '../types/simulator.ts';
import type { Catalog, MarketDataSource } from './dataSource.ts';
import type { CorporateActions, MarketMovers, SeriesColumns } from './types.ts';
import { concatColumns, decodeShard, decodeTail, gunzipIfNeeded } from './codec.ts';

export interface ManifestInstrument extends Instrument {
  /** Frozen-history shard path (relative to the data root), or null if all bars are in the tail. */
  shard: string | null;
  /** Number of bars in the shard + tail. */
  n: number;
  shardBytes: number;
}

export interface DataManifest {
  format: 'kite-sim-data';
  version: 1;
  generatedAt: string;
  dataAsOf: string;
  /** Shards hold bars up to and including this date; later bars are in `tail`. */
  frozenThrough: string;
  instruments: ManifestInstrument[];
  tail: string;
  tailBytes: number;
  actions: string;
  actionsBytes: number;
  movers: Record<string, { file: string; bytes: number }>;
  totalBytes: number;
}

/** Compact precomputed movers for one year. Symbol references are indexes into manifest.instruments. */
export interface MoversYearFile {
  year: number;
  dates: string[];
  rows: Array<{
    /** [instrumentIndex, ltp, changePct, high52w] */
    g: Array<[number, number, number, number]>;
    l: Array<[number, number, number, number]>;
    b: Array<[number, number, number, number]>;
    s: Array<[string, number, number]>;
  }>;
}

export interface ActionsFile {
  splits: Array<[string, string, number, number, string]>;
  dividends: Array<[string, string, number]>;
}

export type BytesFetcher = (path: string) => Promise<Uint8Array>;

export class StaticDataSource implements MarketDataSource {
  readonly capabilities = { remoteSearch: false, addTicker: false, liveSync: false };
  private tailPromise: Promise<Map<string, SeriesColumns>> | null = null;

  constructor(
    private manifest: DataManifest,
    private fetchBytes: BytesFetcher
  ) {}

  private async fetchJson<T>(path: string): Promise<T> {
    const bytes = await gunzipIfNeeded(await this.fetchBytes(path));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  async loadCatalog(): Promise<Catalog> {
    const instruments: Instrument[] = this.manifest.instruments.map(({ shard: _s, n: _n, shardBytes: _b, ...inst }) => ({ ...inst }));
    return { instruments, dataAsOf: this.manifest.dataAsOf };
  }

  async loadActions(): Promise<CorporateActions> {
    const a = await this.fetchJson<ActionsFile>(this.manifest.actions);
    const splits: SplitEvent[] = a.splits.map(([symbol, date, numerator, denominator, ratio]) => ({
      symbol,
      date,
      numerator,
      denominator,
      ratio,
    }));
    const dividends = a.dividends.map(([symbol, date, amount]) => ({ symbol, date, amount }));
    return { splits, dividends };
  }

  private loadTail(): Promise<Map<string, SeriesColumns>> {
    if (!this.tailPromise) {
      this.tailPromise = (async () => {
        if (!this.manifest.tail) return new Map();
        return decodeTail(await gunzipIfNeeded(await this.fetchBytes(this.manifest.tail)));
      })().catch((err) => {
        this.tailPromise = null;
        throw err;
      });
    }
    return this.tailPromise;
  }

  async loadSeries(symbols: string[]): Promise<Map<string, SeriesColumns>> {
    const bySym = new Map(this.manifest.instruments.map((i) => [i.symbol, i]));
    const tail = await this.loadTail();
    const out = new Map<string, SeriesColumns>();
    // Fetch a few shards at a time
    const queue = symbols.filter((s) => bySym.has(s));
    const worker = async () => {
      while (queue.length) {
        const sym = queue.shift()!;
        const inst = bySym.get(sym)!;
        const frozen = inst.shard ? decodeShard(await gunzipIfNeeded(await this.fetchBytes(inst.shard))) : undefined;
        const cols = concatColumns(frozen, tail.get(sym));
        if (cols) out.set(sym, cols);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
    return out;
  }

  async loadMoversYear(year: number): Promise<Map<string, MarketMovers> | null> {
    const entry = this.manifest.movers[String(year)];
    if (!entry) return null;
    const file = await this.fetchJson<MoversYearFile>(entry.file);
    const insts = this.manifest.instruments;
    const map = new Map<string, MarketMovers>();
    file.dates.forEach((date, k) => {
      const r = file.rows[k];
      // Same object shape (and key order) as MarketEngine.computeMoversLive
      const mk = ([i, ltp, changePct, high52w]: [number, number, number, number]) => ({
        symbol: insts[i].symbol,
        name: insts[i].name,
        sector: insts[i].sector,
        ltp,
        changePct,
        high52w,
      });
      map.set(date, {
        gainers: r.g.map(mk),
        losers: r.l.map(mk),
        breakouts52w: r.b.map(mk),
        sectors: r.s.map(([sector, avgChangePct, count]) => ({ sector, avgChangePct, count })),
      });
    });
    return map;
  }

  /** Every file the app needs offline (for prefetching into Cache Storage). */
  static allFiles(m: DataManifest): Array<{ path: string; bytes: number }> {
    const files: Array<{ path: string; bytes: number }> = [
      { path: m.actions, bytes: m.actionsBytes },
      { path: m.tail, bytes: m.tailBytes },
    ];
    for (const i of m.instruments) if (i.shard) files.push({ path: i.shard, bytes: i.shardBytes });
    for (const v of Object.values(m.movers)) files.push({ path: v.file, bytes: v.bytes });
    return files.filter((f) => f.path);
  }
}
