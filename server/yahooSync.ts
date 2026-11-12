import { db, getAllInstruments, getSeededInstruments, getUnsyncedInstruments, seedDefaultInstruments } from './db.ts';
import type { Instrument } from '../src/types/simulator.ts';

const IST_OFFSET_SEC = 5.5 * 3600; // +05:30
const PERIOD_START_2000 = 946684800; // 2000-01-01T00:00:00Z
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SyncStatus {
  running: boolean;
  total: number;
  completed: number;
  failed: string[];
  currentSymbol: string;
}

export const syncStatus: SyncStatus = {
  running: false,
  total: 0,
  completed: 0,
  failed: [],
  currentSymbol: '',
};

export function unixToIstDate(unixSec: number): string {
  const d = new Date((unixSec + IST_OFFSET_SEC) * 1000);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Yahoo chart request with retries (429 / 5xx / network) and a fallback host. */
async function fetchYahoo(query: string, ticker: string): Promise<Response> {
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  const delays = [0, 1000, 4000, 15000];
  let lastErr = '';
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await sleep(delays[attempt] + Math.random() * 500);
    const host = hosts[attempt % hosts.length];
    try {
      const res = await fetch(`${host}${query}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (res.ok) return res;
      lastErr = `HTTP ${res.status}`;
      if (res.status === 404 || res.status === 400) break; // unknown ticker — don't hammer
    } catch (err) {
      lastErr = (err as Error).message;
    }
  }
  throw new Error(`${lastErr} for ${ticker}`);
}

export async function fetchAndStoreYahooHistory(inst: Instrument): Promise<{ barsCount: number; firstDate?: string; lastDate?: string }> {
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const encodedTicker = encodeURIComponent(inst.yahooTicker);
  const query = `/v8/finance/chart/${encodedTicker}?period1=${PERIOD_START_2000}&period2=${period2}&interval=1d&events=div,splits`;
  const res = await fetchYahoo(query, inst.yahooTicker);

  const payload = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { longName?: string; shortName?: string };
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
        events?: {
          splits?: Record<string, { date: number; numerator: number; denominator: number; splitRatio?: string }>;
          dividends?: Record<string, { date: number; amount: number }>;
        };
      }>;
    };
  };

  const result = payload?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`Empty chart payload for ${inst.yahooTicker}`);
  }

  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const closes = q.close || [];
  const volumes = q.volume || [];

  const bars: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
  const seenDates = new Set<string>();

  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c) || c <= 0) continue;
    const o = opens[i] != null && Number.isFinite(opens[i]!) && opens[i]! > 0 ? opens[i]! : c;
    const h = highs[i] != null && Number.isFinite(highs[i]!) && highs[i]! > 0 ? Math.max(highs[i]!, o, c) : Math.max(o, c);
    const l = lows[i] != null && Number.isFinite(lows[i]!) && lows[i]! > 0 ? Math.min(lows[i]!, o, c) : Math.min(o, c);
    const v = volumes[i] != null && Number.isFinite(volumes[i]!) && volumes[i]! >= 0 ? volumes[i]! : 0;

    const date = unixToIstDate(ts[i]);
    if (seenDates.has(date)) {
      // Overwrite duplicate timestamp on same date with latest bar
      const idx = bars.findIndex((b) => b.date === date);
      if (idx >= 0) bars[idx] = { date, open: o, high: h, low: l, close: c, volume: v };
    } else {
      seenDates.add(date);
      bars.push({ date, open: o, high: h, low: l, close: c, volume: v });
    }
  }

  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (bars.length === 0) {
    throw new Error(`No valid OHLC bars for ${inst.yahooTicker}`);
  }

  const splitsObj = result.events?.splits || {};
  const splits = Object.values(splitsObj)
    .filter((s) => s.numerator > 0 && s.denominator > 0 && s.numerator !== s.denominator)
    .map((s) => ({
      date: unixToIstDate(s.date),
      numerator: s.numerator,
      denominator: s.denominator,
      ratio: s.splitRatio || `${s.numerator}:${s.denominator}`,
    }));

  const divsObj = result.events?.dividends || {};
  const dividends = Object.values(divsObj)
    .filter((d) => d.amount > 0 && Number.isFinite(d.amount))
    .map((d) => ({
      date: unixToIstDate(d.date),
      amount: d.amount,
    }));

  const resolvedName = inst.name || result.meta?.longName || result.meta?.shortName || inst.symbol;
  const firstDate = bars[0].date;
  const lastDate = bars[bars.length - 1].date;
  const nowIso = new Date().toISOString();

  const upsertInst = db.prepare(`
    INSERT INTO instruments (
      symbol, yahoo_ticker, name, blind_symbol, blind_name,
      exchange, sector, lot_size, is_index, is_etf,
      first_date, last_date, bar_count, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      first_date = excluded.first_date,
      last_date = excluded.last_date,
      bar_count = excluded.bar_count,
      synced_at = excluded.synced_at
  `);

  const insertBar = db.prepare(`
    INSERT OR REPLACE INTO daily_bars (symbol, date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSplit = db.prepare(`
    INSERT OR REPLACE INTO splits (symbol, date, numerator, denominator, ratio)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertDiv = db.prepare(`
    INSERT OR REPLACE INTO dividends (symbol, date, amount)
    VALUES (?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    upsertInst.run(
      inst.symbol,
      inst.yahooTicker,
      resolvedName,
      inst.blindSymbol,
      inst.blindName,
      inst.exchange,
      inst.sector,
      inst.lotSize,
      inst.isIndex ? 1 : 0,
      inst.isEtf ? 1 : 0,
      firstDate,
      lastDate,
      bars.length,
      nowIso
    );

    for (const b of bars) {
      insertBar.run(inst.symbol, b.date, b.open, b.high, b.low, b.close, b.volume);
    }
    for (const s of splits) {
      insertSplit.run(inst.symbol, s.date, s.numerator, s.denominator, s.ratio);
    }
    for (const d of dividends) {
      insertDiv.run(inst.symbol, d.date, d.amount);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { barsCount: bars.length, firstDate, lastDate };
}

export async function syncUniverse(options?: { forceAll?: boolean; concurrency?: number; onProgress?: (s: SyncStatus) => void }): Promise<SyncStatus> {
  if (syncStatus.running) return syncStatus;

  seedDefaultInstruments();
  const targets = options?.forceAll ? getSeededInstruments() : getUnsyncedInstruments();
  if (targets.length === 0) {
    return {
      running: false,
      total: getAllInstruments().length,
      completed: getAllInstruments().length,
      failed: [],
      currentSymbol: '',
    };
  }

  syncStatus.running = true;
  syncStatus.total = targets.length;
  syncStatus.completed = 0;
  syncStatus.failed = [];
  syncStatus.currentSymbol = targets[0]?.symbol || '';

  const concurrency = options?.concurrency ?? 4;
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const inst = targets[idx];
      syncStatus.currentSymbol = inst.symbol;
      try {
        await fetchAndStoreYahooHistory(inst);
        await sleep(150);
      } catch (err) {
        console.warn(`[YahooSync] Failed ${inst.symbol} (${inst.yahooTicker}):`, (err as Error).message);
        syncStatus.failed.push(inst.symbol);
      } finally {
        syncStatus.completed++;
        options?.onProgress?.({ ...syncStatus });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
  await Promise.all(workers);

  syncStatus.running = false;
  syncStatus.currentSymbol = '';
  return { ...syncStatus };
}

export interface RemoteSearchResult {
  symbol: string;
  yahooTicker: string;
  name: string;
  exchange: 'NSE' | 'BSE' | 'US/GLOBAL';
  exchangeLabel: string;
  isIndian: boolean;
  alreadySynced: boolean;
}

export async function searchRemoteIndianStocks(query: string): Promise<RemoteSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const existing = new Map(getAllInstruments().map((i) => [i.yahooTicker.toUpperCase(), i]));
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(trimmed)}&enableFuzzyQuery=true&quotesCount=15&newsCount=0`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchange?: string;
        exchDisp?: string;
        quoteType?: string;
      }>;
    };

    const indianResults: RemoteSearchResult[] = [];
    const globalResults: RemoteSearchResult[] = [];

    for (const q of data.quotes || []) {
      const ySym = (q.symbol || '').toUpperCase();
      if (!ySym) continue;

      if (ySym.endsWith('.NS') || ySym.endsWith('.BO')) {
        const exchange: 'NSE' | 'BSE' = ySym.endsWith('.BO') ? 'BSE' : 'NSE';
        const baseSymbol = ySym.replace(/\.(NS|BO)$/, '');
        const cleanSymbol = exchange === 'BSE' ? `${baseSymbol}-BSE` : baseSymbol;
        indianResults.push({
          symbol: cleanSymbol,
          yahooTicker: ySym,
          name: q.longname || q.shortname || baseSymbol,
          exchange,
          exchangeLabel: exchange,
          isIndian: true,
          alreadySynced: existing.has(ySym),
        });
      } else if (
        (q.quoteType === 'EQUITY' || q.quoteType === 'ETF') &&
        ['NMS', 'NYQ', 'NGM', 'PCX', 'ASE'].includes(String(q.exchange || ''))
      ) {
        globalResults.push({
          symbol: `${ySym}-US`,
          yahooTicker: ySym,
          name: q.longname || q.shortname || ySym,
          exchange: 'US/GLOBAL',
          exchangeLabel: q.exchDisp || q.exchange || 'NASDAQ/NYSE',
          isIndian: false,
          alreadySynced: existing.has(ySym),
        });
      }
    }
    return [...indianResults, ...globalResults.slice(0, 4)];
  } catch {
    return [];
  }
}

export async function addAndSyncCustomTicker(params: {
  symbol: string;
  yahooTicker: string;
  name?: string;
  exchange?: 'NSE' | 'BSE' | 'US/GLOBAL';
}): Promise<Instrument> {
  const rawEx = params.exchange;
  const exchange: 'NSE' | 'BSE' =
    rawEx === 'BSE' || params.yahooTicker.endsWith('.BO') ? 'BSE' : 'NSE';
  const cleanSymbol = params.symbol.toUpperCase().trim();
  const randCode = String(Math.floor(100 + Math.random() * 899));
  const isGlobal = rawEx === 'US/GLOBAL' || (!params.yahooTicker.endsWith('.NS') && !params.yahooTicker.endsWith('.BO') && !params.yahooTicker.startsWith('^'));
  const inst: Instrument = {
    symbol: cleanSymbol,
    yahooTicker: params.yahooTicker.toUpperCase().trim(),
    name: params.name || cleanSymbol,
    blindSymbol: `CUST-${randCode}`,
    blindName: `Custom Listed Company #${randCode}`,
    exchange,
    sector: isGlobal ? 'US / Global Equity' : 'Custom Equity',
    lotSize: 1,
    isIndex: false,
    isEtf: cleanSymbol.endsWith('BEES') || cleanSymbol.includes('ETF'),
  };

  const meta = await fetchAndStoreYahooHistory(inst);
  inst.firstDate = meta.firstDate;
  inst.lastDate = meta.lastDate;
  return inst;
}
