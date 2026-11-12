/**
 * Parity check: SQLite engine (PC) vs static-file engine (offline PWA) on the exported data.
 *   npm run export:data && npm run parity
 */
import fs from 'node:fs';
import { SqliteDataSource } from '../server/sqliteDataSource.ts';
import { MarketEngine, type CandleTimeframe } from '../src/market/marketEngine.ts';
import { StaticDataSource } from '../src/market/staticDataSource.ts';

const DIR = process.env.PARITY_DATA || 'public/data';
const N = Number(process.env.PARITY_N || 3000);

let seed = 42;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

async function main() {
  const a = new MarketEngine(new SqliteDataSource());
  await a.loadAll();
  const manifest = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`, 'utf8'));
  const b = new MarketEngine(new StaticDataSource(manifest, async (p) => new Uint8Array(fs.readFileSync(`${DIR}/${p}`))));
  b.maxLoadedSymbols = 30;
  await b.init();

  const syms = a.getInstruments().map((i) => i.symbol);
  const dates = a.getTradingDates();
  let checks = 0;
  const fails: string[] = [];
  const eq = (label: string, x: unknown, y: unknown) => {
    checks++;
    const sx = JSON.stringify(x);
    const sy = JSON.stringify(y);
    if (sx !== sy && fails.length < 10) fails.push(`${label}\n  A=${sx.slice(0, 200)}\n  B=${sy.slice(0, 200)}`);
  };

  eq('instruments', a.getInstruments(), b.getInstruments());
  eq('calendar', a.getCalendarBounds(), b.getCalendarBounds());

  for (let i = 0; i < N; i++) {
    const sym = pick(syms);
    const date = rnd() < 0.1 ? `${2000 + Math.floor(rnd() * 27)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}` : pick(dates);
    const intraday = rnd() < 0.4;
    const step = Math.floor(rnd() * 75);
    await b.ensureSymbols([sym]);
    eq(`quote ${sym} ${date} ${intraday} ${step}`, a.getQuote(sym, date, intraday, step), b.getQuote(sym, date, intraday, step));
  }

  const tfs: CandleTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '1D', '1W', '1M'];
  for (let i = 0; i < 120; i++) {
    const sym = pick(syms);
    const date = pick(dates);
    const tf = pick(tfs);
    await b.ensureSymbols([sym]);
    eq(`candles ${sym} ${date} ${tf}`, a.getCandles(sym, date, tf, true, 30), b.getCandles(sym, date, tf, true, 30));
  }

  for (let i = 0; i < 40; i++) {
    const from = pick(dates);
    const to = dates[Math.min(dates.length - 1, dates.indexOf(from) + Math.floor(rnd() * 700))];
    const set = Array.from({ length: 6 }, () => pick(syms));
    await b.ensureSymbols(set);
    eq(`packets ${from}..${to}`, a.getStepPackets(from, to, set), b.getStepPackets(from, to, set));
  }

  for (let i = 0; i < 300; i++) {
    const date = pick(dates);
    await b.ensureMovers(date);
    eq(`movers ${date}`, a.getMarketMovers(date), b.getMarketMovers(date));
  }

  if (fails.length) {
    console.log(`PARITY FAILED (${fails.length}+ of ${checks})\n${fails.join('\n')}`);
    process.exit(1);
  }
  console.log(`PARITY OK: ${checks} checks identical`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
