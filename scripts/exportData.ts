/**
 * Exports the SQLite market database into compact static files for the offline PWA.
 *
 *   npm run export:data                 # from the existing data/simulator.db
 *   npm run export:data -- --sync       # download/refresh from Yahoo first
 *   npm run export:data -- --out dist/data
 *
 * Output (content-hashed, cacheable forever except manifest.json):
 *   public/data/manifest.json
 *   public/data/s/<SYMBOL>.<hash>.bin.gz      frozen history (up to 31 Dec of last year)
 *   public/data/tail.<hash>.bin.gz            this year's bars for every symbol
 *   public/data/actions.<hash>.json.gz        splits + dividends
 *   public/data/movers/<year>.<hash>.json.gz  precomputed dashboard movers per trading day
 *   public/data/sync-report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { db, seedDefaultInstruments } from '../server/db.ts';
import { SqliteDataSource } from '../server/sqliteDataSource.ts';
import { MarketEngine } from '../src/market/marketEngine.ts';
import { decodeShard, decodeTail, encodeShard, encodeTail, gunzipIfNeeded } from '../src/market/codec.ts';
import type { SeriesColumns } from '../src/market/types.ts';
import type { ActionsFile, DataManifest, ManifestInstrument, MoversYearFile } from '../src/market/staticDataSource.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const OUT = path.resolve(opt('out', 'public/data'));
const CORE = ['NIFTY 50', 'SENSEX', 'RELIANCE', 'INFY', 'SBIN'];

function hash8(buf: Uint8Array): string {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

function slug(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]+/g, '_');
}

function writeGz(rel: string, raw: Uint8Array): { file: string; bytes: number } {
  const gz = zlib.gzipSync(raw, { level: 9 });
  const dir = path.dirname(rel);
  const base = path.basename(rel);
  const dot = base.indexOf('.');
  const file = path.posix.join(dir === '.' ? '' : dir, `${base.slice(0, dot)}.${hash8(raw)}${base.slice(dot)}.gz`);
  const abs = path.join(OUT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, gz);
  return { file, bytes: gz.length };
}

function sliceCols(c: SeriesColumns, from: number, to: number): SeriesColumns {
  return {
    dates: c.dates.slice(from, to),
    opens: c.opens.slice(from, to),
    highs: c.highs.slice(from, to),
    lows: c.lows.slice(from, to),
    closes: c.closes.slice(from, to),
    volumes: c.volumes.slice(from, to),
  };
}

function sameCols(a: SeriesColumns, b: SeriesColumns): string | null {
  if (a.dates.length !== b.dates.length) return `length ${a.dates.length} vs ${b.dates.length}`;
  for (let i = 0; i < a.dates.length; i++) {
    if (a.dates[i] !== b.dates[i]) return `date[${i}] ${a.dates[i]} vs ${b.dates[i]}`;
    for (const k of ['opens', 'highs', 'lows', 'closes', 'volumes'] as const) {
      if (a[k][i] !== b[k][i]) return `${k}[${i}] ${a[k][i]} vs ${b[k][i]}`;
    }
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  seedDefaultInstruments();

  let failed: string[] = [];
  if (flag('sync')) {
    const { syncUniverse } = await import('../server/yahooSync.ts');
    const concurrency = Number(opt('concurrency', '4'));
    console.log(`Syncing universe from Yahoo (concurrency ${concurrency})…`);
    const res = await syncUniverse({ concurrency, forceAll: true });
    failed = res?.failed || [];
  }

  const source = new SqliteDataSource();
  const engine = new MarketEngine(source);
  await engine.loadAll();
  const catalog = await source.loadCatalog();
  const instruments = [...catalog.instruments].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  const dataAsOf = catalog.dataAsOf || '';
  const missingCore = CORE.filter((s) => !instruments.some((i) => i.symbol === s));
  if (missingCore.length) throw new Error(`Core symbols missing from DB: ${missingCore.join(', ')}`);
  if (flag('sync') && failed.length > instruments.length * 0.05) {
    throw new Error(`Too many Yahoo failures (${failed.length}); keeping previous data. Failed: ${failed.slice(0, 20).join(', ')}`);
  }

  const frozenThrough = `${Number(dataAsOf.slice(0, 4)) - 1}-12-31`;
  fs.mkdirSync(OUT, { recursive: true });

  // ---- bars ----
  const raw = await source.loadSeries(instruments.map((i) => i.symbol));
  const manifestInsts: ManifestInstrument[] = [];
  const tailEntries: Array<[string, SeriesColumns]> = [];
  for (const inst of instruments) {
    const cols = raw.get(inst.symbol)!;
    let cut = cols.dates.findIndex((d) => d > frozenThrough);
    if (cut < 0) cut = cols.dates.length;
    let shard: string | null = null;
    let shardBytes = 0;
    if (cut > 0) {
      const w = writeGz(`s/${slug(inst.symbol)}.bin`, encodeShard(sliceCols(cols, 0, cut)));
      shard = w.file;
      shardBytes = w.bytes;
    }
    if (cut < cols.dates.length) tailEntries.push([inst.symbol, sliceCols(cols, cut, cols.dates.length)]);
    manifestInsts.push({ ...inst, shard, shardBytes, n: cols.dates.length });
  }
  const tail = writeGz('tail.bin', encodeTail(tailEntries));

  // ---- corporate actions ----
  const actions = await source.loadActions();
  const actionsFile: ActionsFile = {
    splits: actions.splits.map((s) => [s.symbol, s.date, s.numerator, s.denominator, s.ratio]),
    dividends: actions.dividends.map((d) => [d.symbol, d.date, d.amount]),
  };
  const actionsOut = writeGz('actions.json', new TextEncoder().encode(JSON.stringify(actionsFile)));

  // ---- movers ----
  const idx = new Map(instruments.map((i, k) => [i.symbol, k]));
  const byYear = new Map<number, MoversYearFile>();
  const dates = engine.getTradingDates();
  console.log(`Precomputing movers for ${dates.length} trading days…`);
  for (const d of dates) {
    const m = engine.computeMoversLive(d);
    const year = Number(d.slice(0, 4));
    let y = byYear.get(year);
    if (!y) byYear.set(year, (y = { year, dates: [], rows: [] }));
    const row = (x: { symbol: string; ltp: number; changePct: number; high52w?: number }) =>
      [idx.get(x.symbol)!, x.ltp, x.changePct, (x as { high52w: number }).high52w] as [number, number, number, number];
    y.dates.push(d);
    y.rows.push({
      g: m.gainers.map(row),
      l: m.losers.map(row),
      b: m.breakouts52w.map(row),
      s: m.sectors.map((s) => [s.sector, s.avgChangePct, s.count]),
    });
  }
  const movers: DataManifest['movers'] = {};
  for (const [year, file] of byYear) {
    movers[String(year)] = writeGz(`movers/${year}.json`, new TextEncoder().encode(JSON.stringify(file)));
  }

  const totalBytes =
    tail.bytes +
    actionsOut.bytes +
    manifestInsts.reduce((a, i) => a + i.shardBytes, 0) +
    Object.values(movers).reduce((a, m) => a + m.bytes, 0);

  const manifest: DataManifest = {
    format: 'kite-sim-data',
    version: 1,
    generatedAt: new Date().toISOString(),
    dataAsOf,
    frozenThrough,
    instruments: manifestInsts,
    tail: tail.file,
    tailBytes: tail.bytes,
    actions: actionsOut.file,
    actionsBytes: actionsOut.bytes,
    movers,
    totalBytes,
  };

  // ---- self-check: decode everything back and compare bit-for-bit ----
  const tailDecoded = decodeTail(await gunzipIfNeeded(new Uint8Array(fs.readFileSync(path.join(OUT, tail.file)))));
  let checked = 0;
  for (const mi of manifestInsts) {
    const want = raw.get(mi.symbol)!;
    const parts: SeriesColumns[] = [];
    if (mi.shard) parts.push(decodeShard(await gunzipIfNeeded(new Uint8Array(fs.readFileSync(path.join(OUT, mi.shard))))));
    const t = tailDecoded.get(mi.symbol);
    if (t) parts.push(t);
    const got: SeriesColumns = {
      dates: parts.flatMap((p) => p.dates),
      opens: Float64Array.from(parts.flatMap((p) => Array.from(p.opens))),
      highs: Float64Array.from(parts.flatMap((p) => Array.from(p.highs))),
      lows: Float64Array.from(parts.flatMap((p) => Array.from(p.lows))),
      closes: Float64Array.from(parts.flatMap((p) => Array.from(p.closes))),
      volumes: Float64Array.from(parts.flatMap((p) => Array.from(p.volumes))),
    };
    const diff = sameCols(want, got);
    if (diff) throw new Error(`Round-trip mismatch for ${mi.symbol}: ${diff}`);
    checked += 1;
  }

  // ---- write manifest last, then prune files no longer referenced ----
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  const keep = new Set<string>([
    'manifest.json',
    'sync-report.json',
    tail.file,
    actionsOut.file,
    ...manifestInsts.filter((i) => i.shard).map((i) => i.shard!),
    ...Object.values(movers).map((m) => m.file),
  ]);
  let pruned = 0;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else {
        const rel = path.relative(OUT, abs).split(path.sep).join('/');
        if (!keep.has(rel)) {
          fs.unlinkSync(abs);
          pruned += 1;
        }
      }
    }
  };
  walk(OUT);

  const report = {
    generatedAt: manifest.generatedAt,
    dataAsOf,
    instruments: manifestInsts.length,
    bars: manifestInsts.reduce((a, i) => a + i.n, 0),
    totalMB: Number((totalBytes / 1048576).toFixed(2)),
    tailKB: Math.round(tail.bytes / 1024),
    failedTickers: failed,
  };
  fs.writeFileSync(path.join(OUT, 'sync-report.json'), JSON.stringify(report, null, 2));

  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    /* ignore */
  }
  console.log(
    `Exported ${report.instruments} instruments / ${report.bars.toLocaleString()} bars → ${OUT}\n` +
      `  total ${report.totalMB} MB (tail ${report.tailKB} KB, ${Object.keys(movers).length} movers years), ` +
      `round-trip verified for ${checked} symbols, pruned ${pruned} stale files, ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
