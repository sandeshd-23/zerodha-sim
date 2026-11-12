import { db, getAllInstruments } from './db.ts';
import type { Catalog, MarketDataSource } from '../src/market/dataSource.ts';
import type { CorporateActions, SeriesColumns } from '../src/market/types.ts';

/** Market data straight from data/simulator.db (PC server, exporter). */
export class SqliteDataSource implements MarketDataSource {
  readonly capabilities = { remoteSearch: true, addTicker: true, liveSync: true };

  async loadCatalog(): Promise<Catalog> {
    const ranges = new Map<string, { first: string; last: string }>();
    const rows = db
      .prepare(`SELECT symbol, MIN(date) AS first, MAX(date) AS last FROM daily_bars GROUP BY symbol`)
      .all() as Array<Record<string, unknown>>;
    let dataAsOf = '';
    for (const r of rows) {
      ranges.set(String(r.symbol), { first: String(r.first), last: String(r.last) });
      if (String(r.last) > dataAsOf) dataAsOf = String(r.last);
    }
    const instruments = getAllInstruments()
      .filter((i) => ranges.has(i.symbol))
      .map((i) => ({ ...i, firstDate: ranges.get(i.symbol)!.first, lastDate: ranges.get(i.symbol)!.last }));
    return { instruments, dataAsOf };
  }

  async loadActions(): Promise<CorporateActions> {
    const splits = (
      db.prepare(`SELECT symbol, date, numerator, denominator, ratio FROM splits ORDER BY date ASC`).all() as Array<
        Record<string, unknown>
      >
    ).map((r) => ({
      symbol: String(r.symbol),
      date: String(r.date),
      numerator: Number(r.numerator),
      denominator: Number(r.denominator),
      ratio: String(r.ratio),
    }));
    const dividends = (
      db.prepare(`SELECT symbol, date, amount FROM dividends ORDER BY date ASC`).all() as Array<Record<string, unknown>>
    ).map((r) => ({ symbol: String(r.symbol), date: String(r.date), amount: Number(r.amount) }));
    return { splits, dividends };
  }

  async loadSeries(symbols: string[]): Promise<Map<string, SeriesColumns>> {
    const out = new Map<string, SeriesColumns>();
    const stmt = db.prepare(
      `SELECT date, open, high, low, close, volume FROM daily_bars WHERE symbol = ? ORDER BY date ASC`
    );
    for (const sym of symbols) {
      const rows = stmt.all(sym) as Array<Record<string, unknown>>;
      const n = rows.length;
      if (n === 0) continue;
      const cols: SeriesColumns = {
        dates: new Array<string>(n),
        opens: new Float64Array(n),
        highs: new Float64Array(n),
        lows: new Float64Array(n),
        closes: new Float64Array(n),
        volumes: new Float64Array(n),
      };
      for (let i = 0; i < n; i++) {
        const r = rows[i];
        cols.dates[i] = String(r.date);
        cols.opens[i] = Number(r.open);
        cols.highs[i] = Number(r.high);
        cols.lows[i] = Number(r.low);
        cols.closes[i] = Number(r.close);
        cols.volumes[i] = Number(r.volume);
      }
      out.set(sym, cols);
    }
    return out;
  }
}
