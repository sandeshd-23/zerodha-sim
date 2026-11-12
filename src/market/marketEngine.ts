import type { CandleBar, DividendEvent, Instrument, MarketQuote, SplitEvent } from '../types/simulator.ts';
import {
  aggregateIntradayBars,
  generateMarketDepth,
  roundTick,
  synthesizeIntraday5mBars,
} from '../engine/intraday.ts';
import type { MarketDataSource } from './dataSource.ts';
import type { DayStepBar, DayStepPacket, MarketMovers, SeriesColumns, SymbolSeries } from './types.ts';

export type { DayStepBar, DayStepPacket, MarketMovers, SymbolSeries } from './types.ts';

export type CandleTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '2H' | '1D' | '1W' | '1M';

/** Symbols whose dates define the trading calendar (and are always kept in memory). */
const CALENDAR_SYMBOLS = ['SENSEX', 'NIFTY 50', 'RELIANCE', 'INFY', 'SBIN'];

/**
 * Historical market engine. Data comes from a pluggable MarketDataSource so the same engine runs
 * on the PC server (SQLite) and inside the offline PWA (static files in a Web Worker).
 *
 * Loading is async (`init`, `ensureSymbols`, `ensureMovers`, `loadAll`); every query method is
 * synchronous and only sees symbols that have been loaded.
 */
export class MarketEngine {
  private seriesMap = new Map<string, SymbolSeries>();
  private instruments: Instrument[] = [];
  private instMap = new Map<string, Instrument>();
  private splitsBySym = new Map<string, SplitEvent[]>();
  private divsBySym = new Map<string, Array<{ date: string; yahooAmount: number }>>();
  private tradingDates: string[] = [];
  private moversByDate = new Map<string, MarketMovers>();
  private moversYearsLoaded = new Set<number>();
  private lastUse = new Map<string, number>();
  private useCounter = 0;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private allLoaded = false;
  public dataAsOf: string | undefined;

  /** Max symbols kept in memory when lazily loading (0 = unlimited). */
  public maxLoadedSymbols = 0;

  constructor(private source: MarketDataSource) {}

  get capabilities() {
    return this.source.capabilities;
  }

  public init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  /** Drop everything and reload from the data source (after a sync / data update). */
  public async reinit(): Promise<void> {
    this.initPromise = null;
    this.initialized = false;
    this.allLoaded = false;
    this.seriesMap.clear();
    this.moversByDate.clear();
    this.moversYearsLoaded.clear();
    await this.init();
  }

  private async doInit(): Promise<void> {
    const [catalog, actions] = await Promise.all([this.source.loadCatalog(), this.source.loadActions()]);
    this.seriesMap.clear();
    // Same ordering as the original engine (bars were read ORDER BY symbol ASC).
    this.instruments = [...catalog.instruments].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
    this.instMap = new Map(this.instruments.map((i) => [i.symbol, i]));
    this.dataAsOf = catalog.dataAsOf;

    this.splitsBySym.clear();
    for (const s of actions.splits) {
      const list = this.splitsBySym.get(s.symbol) || [];
      list.push(s);
      this.splitsBySym.set(s.symbol, list);
    }
    this.divsBySym.clear();
    for (const d of actions.dividends) {
      const list = this.divsBySym.get(d.symbol) || [];
      list.push({ date: d.date, yahooAmount: d.amount });
      this.divsBySym.set(d.symbol, list);
    }
    for (const list of this.splitsBySym.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const list of this.divsBySym.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    await this.loadSeriesInto(CALENDAR_SYMBOLS.filter((s) => this.instMap.has(s)));
    this.rebuildTradingCalendar();
    this.initialized = true;
  }

  /** Load every instrument's bars (PC server / exporter). */
  public async loadAll(): Promise<void> {
    await this.init();
    await this.loadSeriesInto(this.instruments.map((i) => i.symbol).filter((s) => !this.seriesMap.has(s)));
    this.allLoaded = true;
  }

  /** Make sure the given symbols' bars are in memory. Unknown symbols are ignored. */
  public async ensureSymbols(symbols: Iterable<string>): Promise<void> {
    await this.init();
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const s of symbols) {
      if (seen.has(s)) continue;
      seen.add(s);
      this.lastUse.set(s, ++this.useCounter);
      if (!this.seriesMap.has(s) && this.instMap.has(s)) missing.push(s);
    }
    if (missing.length > 0) await this.loadSeriesInto(missing);
    this.evictIfNeeded(seen);
  }

  /** Make sure precomputed movers for the date's year are available (offline data only). */
  public async ensureMovers(date: string): Promise<void> {
    if (this.allLoaded || !this.source.loadMoversYear) return;
    const year = Number(date.slice(0, 4));
    if (!year || this.moversYearsLoaded.has(year)) return;
    const map = await this.source.loadMoversYear(year);
    this.moversYearsLoaded.add(year);
    if (map) for (const [d, m] of map) this.moversByDate.set(d, m);
  }

  public isLoaded(symbol: string): boolean {
    return this.seriesMap.has(symbol);
  }

  private async loadSeriesInto(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;
    const loaded = await this.source.loadSeries(symbols);
    for (const sym of symbols) {
      const cols = loaded.get(sym);
      const inst = this.instMap.get(sym);
      if (!cols || !inst || cols.dates.length === 0) continue;
      this.installSeries(inst, cols);
    }
    if (symbols.includes('NIFTY 50') || symbols.includes('SENSEX')) this.stitchPre2007NiftyFromSensex();
  }

  private installSeries(inst: Instrument, cols: SeriesColumns): void {
    const n = cols.dates.length;
    inst.firstDate = cols.dates[0];
    inst.lastDate = cols.dates[n - 1];
    this.seriesMap.set(inst.symbol, {
      instrument: inst,
      dates: cols.dates,
      opens: cols.opens,
      highs: cols.highs,
      lows: cols.lows,
      closes: cols.closes,
      volumes: cols.volumes,
      splits: this.splitsBySym.get(inst.symbol) || [],
      dividends: this.divsBySym.get(inst.symbol) || [],
    });
  }

  private evictIfNeeded(keep: Set<string>): void {
    if (!this.maxLoadedSymbols || this.seriesMap.size <= this.maxLoadedSymbols) return;
    const candidates = Array.from(this.seriesMap.keys())
      .filter((s) => !keep.has(s) && !CALENDAR_SYMBOLS.includes(s))
      .sort((a, b) => (this.lastUse.get(a) || 0) - (this.lastUse.get(b) || 0));
    for (const s of candidates) {
      if (this.seriesMap.size <= this.maxLoadedSymbols) break;
      this.seriesMap.delete(s);
    }
  }

  /**
   * Yahoo's ^NSEI starts on 2007-09-17 whereas ^BSESN starts 2000-01-03.
   * Backfill NIFTY 50 prior to 2007-09-17 from SENSEX scaled continuously at the 2007-09-17 junction
   * so NIFTY 50 works seamlessly across the entire 2000-2026 range.
   */
  private stitchPre2007NiftyFromSensex(): void {
    const nifty = this.seriesMap.get('NIFTY 50');
    const sensex = this.seriesMap.get('SENSEX');
    if (!nifty || !sensex || nifty.dates.length === 0 || sensex.dates.length === 0) return;
    if ((nifty as SymbolSeries & { stitched?: boolean }).stitched) return;

    const firstNiftyDate = nifty.dates[0];
    const sensexJoinIdx = this.binarySearchOnOrBefore(sensex.dates, firstNiftyDate);
    if (sensexJoinIdx <= 0) return;

    const ratio = nifty.opens[0] / sensex.opens[sensexJoinIdx];
    const prefixCount = sensexJoinIdx;
    const total = prefixCount + nifty.dates.length;

    const dates = new Array<string>(total);
    const opens = new Float64Array(total);
    const highs = new Float64Array(total);
    const lows = new Float64Array(total);
    const closes = new Float64Array(total);
    const volumes = new Float64Array(total);

    for (let i = 0; i < prefixCount; i++) {
      dates[i] = sensex.dates[i];
      opens[i] = roundTick(sensex.opens[i] * ratio);
      highs[i] = roundTick(sensex.highs[i] * ratio);
      lows[i] = roundTick(sensex.lows[i] * ratio);
      closes[i] = roundTick(sensex.closes[i] * ratio);
      volumes[i] = sensex.volumes[i];
    }
    for (let j = 0; j < nifty.dates.length; j++) {
      const k = prefixCount + j;
      dates[k] = nifty.dates[j];
      opens[k] = nifty.opens[j];
      highs[k] = nifty.highs[j];
      lows[k] = nifty.lows[j];
      closes[k] = nifty.closes[j];
      volumes[k] = nifty.volumes[j];
    }

    nifty.dates = dates;
    nifty.opens = opens;
    nifty.highs = highs;
    nifty.lows = lows;
    nifty.closes = closes;
    nifty.volumes = volumes;
    nifty.instrument.firstDate = dates[0];
    (nifty as SymbolSeries & { stitched?: boolean }).stitched = true;
  }

  private rebuildTradingCalendar(): void {
    const dateSet = new Set<string>();
    for (const sym of CALENDAR_SYMBOLS) {
      const s = this.seriesMap.get(sym);
      if (s) {
        for (const d of s.dates) dateSet.add(d);
      }
    }
    if (dateSet.size === 0) {
      for (const s of this.seriesMap.values()) {
        for (const d of s.dates) dateSet.add(d);
      }
    }
    this.tradingDates = Array.from(dateSet).sort();
  }

  /** Re-read one symbol (and the catalog) after an on-demand custom stock sync. */
  public async reloadSymbol(symbol: string): Promise<void> {
    const [catalog, actions] = await Promise.all([this.source.loadCatalog(), this.source.loadActions()]);
    const inst = catalog.instruments.find((i) => i.symbol === symbol);
    if (!inst) return;
    if (!this.instMap.has(symbol)) {
      this.instruments.push(inst);
      this.instruments.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
      this.instMap.set(symbol, inst);
    }
    this.splitsBySym.set(symbol, actions.splits.filter((s) => s.symbol === symbol));
    this.divsBySym.set(
      symbol,
      actions.dividends.filter((d) => d.symbol === symbol).map((d) => ({ date: d.date, yahooAmount: d.amount }))
    );
    this.seriesMap.delete(symbol);
    await this.loadSeriesInto([symbol]);
  }

  public ensureInit(): void {
    if (!this.initialized) {
      throw new Error('MarketEngine used before init() resolved');
    }
  }

  public getInstruments(): Instrument[] {
    this.ensureInit();
    return this.instruments;
  }

  public getInstrument(symbol: string): Instrument | undefined {
    return this.instMap.get(symbol);
  }

  public getTradingDates(): string[] {
    this.ensureInit();
    return this.tradingDates;
  }

  public getCalendarBounds(): { minDate: string; maxDate: string; totalTradingDays: number } {
    this.ensureInit();
    return {
      minDate: this.tradingDates[0] || '2000-01-03',
      maxDate: this.tradingDates[this.tradingDates.length - 1] || '2026-01-01',
      totalTradingDays: this.tradingDates.length,
    };
  }

  public resolveTradingDate(targetDate: string, mode: 'on_or_before' | 'on_or_after' = 'on_or_after'): string {
    this.ensureInit();
    if (this.tradingDates.length === 0) return targetDate;
    if (mode === 'on_or_before') {
      const idx = this.binarySearchOnOrBefore(this.tradingDates, targetDate);
      return idx >= 0 ? this.tradingDates[idx] : this.tradingDates[0];
    } else {
      const idx = this.binarySearchOnOrAfter(this.tradingDates, targetDate);
      return idx < this.tradingDates.length ? this.tradingDates[idx] : this.tradingDates[this.tradingDates.length - 1];
    }
  }

  public computeFutureSplitMultiplier(series: SymbolSeries, asOfDate: string): number {
    let factor = 1.0;
    for (const s of series.splits) {
      if (s.date > asOfDate && s.numerator > 0 && s.denominator > 0) {
        factor *= s.numerator / s.denominator;
      }
    }
    return factor;
  }

  private computeAnnualizedVol(series: SymbolSeries, idx: number): number {
    if (idx < 6) return 0.25;
    const window = Math.min(25, idx);
    const rets: number[] = [];
    for (let i = idx - window + 1; i <= idx; i++) {
      const c0 = series.closes[i - 1];
      const c1 = series.closes[i];
      if (c0 > 0 && c1 > 0) {
        rets.push(Math.log(c1 / c0));
      }
    }
    if (rets.length < 4) return 0.25;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (rets.length - 1);
    const ann = Math.sqrt(variance * 252);
    return Math.max(0.11, Math.min(1.15, ann));
  }

  private getSeries(symbol: string): SymbolSeries | undefined {
    const series = this.seriesMap.get(symbol);
    if (!series && this.instMap.has(symbol) && !this.allLoaded) {
      console.warn(`[MarketEngine] ${symbol} requested but not loaded — call ensureSymbols() first.`);
    }
    return series;
  }

  public getQuote(symbol: string, simDate: string, intradayEnabled = false, stepIndex = 74): MarketQuote {
    this.ensureInit();
    const series = this.getSeries(symbol);
    if (!series) {
      return this.emptyQuote(symbol);
    }

    const idx = this.binarySearchOnOrBefore(series.dates, simDate);
    if (idx < 0) {
      return {
        ...this.emptyQuote(symbol),
        firstDate: series.dates[0],
      };
    }

    const F = this.computeFutureSplitMultiplier(series, simDate);
    const dOpen = roundTick(series.opens[idx] * F);
    const dHigh = roundTick(series.highs[idx] * F);
    const dLow = roundTick(series.lows[idx] * F);
    const dClose = roundTick(series.closes[idx] * F);
    const dVol = series.volumes[idx];
    const prevClose = idx > 0 ? roundTick(series.closes[idx - 1] * F) : dOpen;

    let ltp = dClose;
    let open = dOpen;
    let high = dHigh;
    let low = dLow;
    let volume = dVol;

    const isSameDay = series.dates[idx] === simDate;
    if (intradayEnabled && isSameDay && stepIndex < 74) {
      const bars5m = synthesizeIntraday5mBars(symbol, simDate, dOpen, dHigh, dLow, dClose, dVol);
      const clampedStep = Math.max(0, Math.min(74, stepIndex));
      open = bars5m[0].open;
      ltp = bars5m[clampedStep].close;
      high = bars5m[0].high;
      low = bars5m[0].low;
      volume = 0;
      for (let s = 0; s <= clampedStep; s++) {
        if (bars5m[s].high > high) high = bars5m[s].high;
        if (bars5m[s].low < low) low = bars5m[s].low;
        volume += bars5m[s].volume;
      }
    }

    // 52-week high/low strictly up to (idx, stepIndex)
    const start52 = Math.max(0, idx - 251);
    let high52w = high;
    let low52w = low;
    for (let k = start52; k < idx; k++) {
      const hk = roundTick(series.highs[k] * F);
      const lk = roundTick(series.lows[k] * F);
      if (hk > high52w) high52w = hk;
      if (lk < low52w) low52w = lk;
    }

    const change = Number((ltp - prevClose).toFixed(2));
    const changePct = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
    const avgPrice = roundTick((open + high + low + ltp) / 4);
    const upperCircuit = roundTick(prevClose * 1.2);
    const lowerCircuit = roundTick(prevClose * 0.8);
    const annualizedVol = this.computeAnnualizedVol(series, idx);

    const depth = generateMarketDepth(
      symbol,
      simDate,
      intradayEnabled ? stepIndex : 74,
      ltp,
      dVol,
      series.instrument.isIndex
    );

    return {
      symbol,
      ltp,
      open,
      high,
      low,
      close: dClose,
      prevClose,
      change,
      changePct,
      volume,
      avgPrice,
      high52w,
      low52w,
      upperCircuit,
      lowerCircuit,
      annualizedVol,
      available: true,
      firstDate: series.dates[0],
      date: series.dates[idx],
      ...depth,
    };
  }

  public getQuotesBatch(symbols: string[], simDate: string, intradayEnabled = false, stepIndex = 74): Record<string, MarketQuote> {
    const out: Record<string, MarketQuote> = {};
    for (const sym of symbols) {
      out[sym] = this.getQuote(sym, simDate, intradayEnabled, stepIndex);
    }
    return out;
  }

  public getCandles(
    symbol: string,
    simDate: string,
    timeframe: CandleTimeframe,
    intradayEnabled = false,
    stepIndex = 74
  ): { candles: CandleBar[]; splits: SplitEvent[]; dividends: DividendEvent[]; available: boolean; firstDate?: string } {
    this.ensureInit();
    const series = this.getSeries(symbol);
    if (!series) {
      return { candles: [], splits: [], dividends: [], available: false };
    }

    const endIdx = this.binarySearchOnOrBefore(series.dates, simDate);
    if (endIdx < 0) {
      return { candles: [], splits: [], dividends: [], available: false, firstDate: series.dates[0] };
    }

    const F = this.computeFutureSplitMultiplier(series, simDate);

    // Filter corporate actions strictly <= simDate
    const splits = series.splits.filter((s) => s.date <= simDate);
    const dividends: DividendEvent[] = series.dividends
      .filter((d) => d.date <= simDate)
      .map((d) => {
        const divF = this.computeFutureSplitMultiplier(series, d.date);
        return {
          symbol,
          date: d.date,
          amount: Number((d.yahooAmount * divF).toFixed(2)),
        };
      });

    const intradayGroup: Partial<Record<CandleTimeframe, number>> = { '5m': 1, '15m': 3, '30m': 6, '1H': 12, '2H': 24 };
    if (timeframe === '1m' || timeframe === '3m' || intradayGroup[timeframe]) {
      // Synthesize trailing trading days of intraday bars (fewer days for very fine timeframes)
      const days = timeframe === '1m' ? 3 : timeframe === '3m' ? 6 : timeframe === '2H' ? 30 : 12;
      const startIdx = Math.max(0, endIdx - (days - 1));
      const all5m: CandleBar[] = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const dStr = series.dates[i];
        const dO = roundTick(series.opens[i] * F);
        const dH = roundTick(series.highs[i] * F);
        const dL = roundTick(series.lows[i] * F);
        const dC = roundTick(series.closes[i] * F);
        const dV = series.volumes[i];
        const dayBars = synthesizeIntraday5mBars(symbol, dStr, dO, dH, dL, dC, dV);
        if (i === endIdx && intradayEnabled && dStr === simDate && stepIndex < 74) {
          all5m.push(...dayBars.slice(0, Math.max(1, stepIndex + 1)));
        } else {
          all5m.push(...dayBars);
        }
      }
      if (timeframe === '1m' || timeframe === '3m') {
        return {
          candles: splitIntradayBars(symbol, all5m, timeframe === '1m' ? 5 : 5 / 3),
          splits,
          dividends,
          available: true,
          firstDate: series.dates[0],
        };
      }
      return {
        candles:
          timeframe === '30m' || timeframe === '2H'
            ? aggregateByDay(all5m, intradayGroup[timeframe]!)
            : aggregateIntradayBars(all5m, intradayGroup[timeframe]!),
        splits,
        dividends,
        available: true,
        firstDate: series.dates[0],
      };
    }

    // Build daily bars up to endIdx (max ~6700 bars)
    const dailyBars: CandleBar[] = new Array(endIdx + 1);
    for (let i = 0; i <= endIdx; i++) {
      const isPartialToday = i === endIdx && intradayEnabled && series.dates[i] === simDate && stepIndex < 74;
      if (isPartialToday) {
        const q = this.getQuote(symbol, simDate, true, stepIndex);
        dailyBars[i] = {
          time: series.dates[i],
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.ltp,
          volume: q.volume,
        };
      } else {
        dailyBars[i] = {
          time: series.dates[i],
          open: roundTick(series.opens[i] * F),
          high: roundTick(series.highs[i] * F),
          low: roundTick(series.lows[i] * F),
          close: roundTick(series.closes[i] * F),
          volume: Math.round(series.volumes[i]),
        };
      }
    }

    if (timeframe === '1D') {
      return { candles: dailyBars, splits, dividends, available: true, firstDate: series.dates[0] };
    }

    // Aggregate Weekly ('1W') or Monthly ('1M')
    const grouped: CandleBar[] = [];
    let currentKey = '';
    let acc: CandleBar | null = null;

    for (const b of dailyBars) {
      const dStr = String(b.time);
      let key: string;
      if (timeframe === '1M') {
        key = dStr.slice(0, 7); // YYYY-MM
      } else {
        // Weekly bucket by Monday of that week
        const dt = new Date(dStr + 'T00:00:00Z');
        const day = dt.getUTCDay() || 7;
        dt.setUTCDate(dt.getUTCDate() - day + 1);
        key = dt.toISOString().slice(0, 10);
      }

      if (key !== currentKey || !acc) {
        if (acc) grouped.push(acc);
        currentKey = key;
        acc = { ...b };
      } else {
        if (b.high > acc.high) acc.high = b.high;
        if (b.low < acc.low) acc.low = b.low;
        acc.close = b.close;
        acc.volume += b.volume;
      }
    }
    if (acc) grouped.push(acc);

    return { candles: grouped, splits, dividends, available: true, firstDate: series.dates[0] };
  }

  /** Movers for a date: precomputed (offline data) when available, otherwise computed from loaded series. */
  public getMarketMovers(simDate: string): MarketMovers {
    this.ensureInit();
    const pre = this.moversByDate.get(simDate);
    if (pre) return pre;
    if (!this.allLoaded && this.source.loadMoversYear) {
      // Non-trading date (weekend) or year not yet loaded: use the nearest earlier precomputed date.
      const idx = this.binarySearchOnOrBefore(this.tradingDates, simDate);
      const near = idx >= 0 ? this.moversByDate.get(this.tradingDates[idx]) : undefined;
      if (near) return near;
    }
    return this.computeMoversLive(simDate);
  }

  public computeMoversLive(simDate: string): MarketMovers {
    this.ensureInit();
    const items: Array<{
      symbol: string;
      name: string;
      sector: string;
      ltp: number;
      changePct: number;
      high52w: number;
    }> = [];

    const sectorMap = new Map<string, { sum: number; count: number }>();

    // Iterate in symbol order (not load order) so ties sort deterministically.
    for (const inst of this.instruments) {
      const sym = inst.symbol;
      const series = this.seriesMap.get(sym);
      if (!series) continue;
      if (series.instrument.isIndex || series.instrument.isEtf) continue;
      const idx = this.binarySearchOnOrBefore(series.dates, simDate);
      if (idx <= 0) continue;
      // Ensure stock traded near simDate (within 7 days)
      if (series.dates[idx] < this.shiftIsoDays(simDate, -7)) continue;

      const F = this.computeFutureSplitMultiplier(series, simDate);
      const ltp = roundTick(series.closes[idx] * F);
      const prev = roundTick(series.closes[idx - 1] * F);
      if (prev <= 0) continue;
      const changePct = Number((((ltp - prev) / prev) * 100).toFixed(2));

      const start52 = Math.max(0, idx - 251);
      let high52w = ltp;
      for (let k = start52; k <= idx; k++) {
        const hk = roundTick(series.highs[k] * F);
        if (hk > high52w) high52w = hk;
      }

      items.push({
        symbol: sym,
        name: series.instrument.name,
        sector: series.instrument.sector,
        ltp,
        changePct,
        high52w,
      });

      const sec = sectorMap.get(series.instrument.sector) || { sum: 0, count: 0 };
      sec.sum += changePct;
      sec.count += 1;
      sectorMap.set(series.instrument.sector, sec);
    }

    const sortedDesc = [...items].sort((a, b) => b.changePct - a.changePct);
    const sortedAsc = [...items].sort((a, b) => a.changePct - b.changePct);
    const breakouts52w = items
      .filter((x) => x.ltp >= x.high52w * 0.992 && x.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 6);

    const sectors = Array.from(sectorMap.entries())
      .map(([sector, v]) => ({
        sector,
        avgChangePct: Number((v.sum / v.count).toFixed(2)),
        count: v.count,
      }))
      .sort((a, b) => b.avgChangePct - a.avgChangePct);

    return {
      gainers: sortedDesc.slice(0, 8),
      losers: sortedAsc.slice(0, 8),
      breakouts52w,
      sectors,
    };
  }

  /**
   * Computes intermediate trading dates and day-by-day market packets from (fromDate, targetDate]
   * so multi-month / multi-year fast-forwards evaluate every single historical day's triggers,
   * splits, dividends, SIPs, and equity curve points!
   */
  public getStepPackets(fromDateExclusive: string, toDateInclusive: string, symbols: string[]): DayStepPacket[] {
    this.ensureInit();
    const startIdx = this.binarySearchStrictlyAfter(this.tradingDates, fromDateExclusive);
    const endIdx = this.binarySearchOnOrBefore(this.tradingDates, toDateInclusive);
    if (startIdx >= this.tradingDates.length || endIdx < startIdx) return [];

    const uniqueSymbols = Array.from(new Set([...symbols, 'NIFTY 50']));
    const packets: DayStepPacket[] = [];

    for (let t = startIdx; t <= endIdx; t++) {
      const d = this.tradingDates[t];
      const prevTradingDate = t > 0 ? this.tradingDates[t - 1] : fromDateExclusive;
      const bars: Record<string, DayStepBar> = {};
      const daySplits: DayStepPacket['splits'] = [];
      const dayDividends: DividendEvent[] = [];

      for (const sym of uniqueSymbols) {
        const series = this.getSeries(sym);
        if (!series) continue;

        const idx = this.binarySearchOnOrBefore(series.dates, d);
        if (idx < 0) continue;

        const F = this.computeFutureSplitMultiplier(series, d);
        const open = roundTick(series.opens[idx] * F);
        const high = roundTick(series.highs[idx] * F);
        const low = roundTick(series.lows[idx] * F);
        const close = roundTick(series.closes[idx] * F);
        const prevClose = idx > 0 ? roundTick(series.closes[idx - 1] * F) : open;

        bars[sym] = {
          open,
          high,
          low,
          close,
          prevClose,
          volume: series.volumes[idx],
          annualizedVol: this.computeAnnualizedVol(series, idx),
        };

        // Capture any splits or dividends occurring in (prevTradingDate, d] (handles weekend/holiday ex-dates too!)
        for (const s of series.splits) {
          if (s.date > prevTradingDate && s.date <= d) {
            daySplits.push(s);
          }
        }
        for (const div of series.dividends) {
          if (div.date > prevTradingDate && div.date <= d) {
            const divAmount = Number((div.yahooAmount * F).toFixed(4));
            if (divAmount > 0) {
              dayDividends.push({ symbol: sym, date: d, amount: divAmount });
            }
          }
        }
      }

      packets.push({
        date: d,
        niftyClose: bars['NIFTY 50']?.close || 0,
        bars,
        splits: daySplits,
        dividends: dayDividends,
      });
    }

    return packets;
  }

  public computeTargetDate(currentDate: string, step: '1D' | '1W' | '1M' | '6M' | '1Y'): string {
    this.ensureInit();
    if (step === '1D') {
      const idx = this.binarySearchStrictlyAfter(this.tradingDates, currentDate);
      return idx < this.tradingDates.length ? this.tradingDates[idx] : this.tradingDates[this.tradingDates.length - 1];
    }

    const dt = new Date(currentDate + 'T00:00:00Z');
    if (step === '1W') dt.setUTCDate(dt.getUTCDate() + 7);
    else if (step === '1M') dt.setUTCMonth(dt.getUTCMonth() + 1);
    else if (step === '6M') dt.setUTCMonth(dt.getUTCMonth() + 6);
    else if (step === '1Y') dt.setUTCFullYear(dt.getUTCFullYear() + 1);

    const targetIso = dt.toISOString().slice(0, 10);
    const resolved = this.resolveTradingDate(targetIso, 'on_or_before');
    if (resolved <= currentDate) {
      const nextIdx = this.binarySearchStrictlyAfter(this.tradingDates, currentDate);
      return nextIdx < this.tradingDates.length ? this.tradingDates[nextIdx] : currentDate;
    }
    return resolved;
  }

  private shiftIsoDays(isoDate: string, deltaDays: number): string {
    const dt = new Date(isoDate + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
  }

  private emptyQuote(symbol: string): MarketQuote {
    return {
      symbol,
      ltp: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      prevClose: 0,
      change: 0,
      changePct: 0,
      volume: 0,
      avgPrice: 0,
      high52w: 0,
      low52w: 0,
      upperCircuit: 0,
      lowerCircuit: 0,
      annualizedVol: 0.25,
      available: false,
      bids: [],
      asks: [],
      totalBidQty: 0,
      totalAskQty: 0,
    };
  }

  public binarySearchOnOrBefore(arr: string[], target: string): number {
    let lo = 0;
    let hi = arr.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= target) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  private binarySearchOnOrAfter(arr: string[], target: string): number {
    let lo = 0;
    let hi = arr.length - 1;
    let ans = arr.length;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] >= target) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  private binarySearchStrictlyAfter(arr: string[], target: string): number {
    let lo = 0;
    let hi = arr.length - 1;
    let ans = arr.length;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] > target) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }
}

/**
 * Splits synthesized 5-minute bars into finer bars (1m: 5 parts, 3m: 5/3 → handled as 1m then regrouped).
 * Deterministic: the path inside each 5m bar goes open → (high/low in an order seeded by the bar) → close.
 */
function splitIntradayBars(symbol: string, bars5m: CandleBar[], partsPer5m: number): CandleBar[] {
  const oneMin: CandleBar[] = [];
  for (const b of bars5m) {
    const t0 = Number(b.time);
    const seed = hashStr(`${symbol}|${t0}`);
    const highFirst = (seed & 1) === 0;
    const path = highFirst ? [b.open, b.high, b.low, b.close] : [b.open, b.low, b.high, b.close];
    // 5 one-minute closes walking the path
    const closes = [
      lerp(path[0], path[1], 0.6),
      path[1],
      lerp(path[1], path[2], 0.5),
      path[2],
      path[3],
    ].map((v) => roundTick(v));
    let prev = b.open;
    for (let k = 0; k < 5; k++) {
      const c = closes[k];
      const hi = roundTick(Math.min(b.high, Math.max(prev, c) * (1 + ((seed >> (k + 1)) & 3) * 0.0002)));
      const lo = roundTick(Math.max(b.low, Math.min(prev, c) * (1 - ((seed >> (k + 3)) & 3) * 0.0002)));
      oneMin.push({ time: t0 + k * 60, open: prev, high: Math.max(hi, prev, c), low: Math.min(lo, prev, c), close: c, volume: Math.round(b.volume / 5) });
      prev = c;
    }
  }
  if (partsPer5m === 5) return oneMin;
  // 3-minute bars: group consecutive 1m bars by 3 within each day (aggregateIntradayBars groups by count)
  return aggregateByDay(oneMin, 3);
}

/** Group intraday bars by count without letting a group span two sessions (IST days). */
function aggregateByDay(bars: CandleBar[], groupSize: number): CandleBar[] {
  const out: CandleBar[] = [];
  let dayStart = 0;
  for (let i = 1; i <= bars.length; i++) {
    const dayOf = (b: CandleBar) => Math.floor((Number(b.time) + 19800) / 86400);
    if (i === bars.length || dayOf(bars[i]) !== dayOf(bars[dayStart])) {
      out.push(...aggregateIntradayBars(bars.slice(dayStart, i), groupSize));
      dayStart = i;
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
