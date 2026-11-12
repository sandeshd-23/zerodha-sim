/**
 * Golden-scenario recorder.
 *
 * Runs a fixed trading scenario against the simulator HTTP API and writes the
 * normalised responses to a JSON file, so refactors can be checked for
 * behaviour changes:
 *
 *   SIM_DATA_DIR=<copy of data/> tsx scripts/golden.ts out.json   (starts server/index.ts in-process)
 *   GOLDEN_URL=http://localhost:5173 tsx scripts/golden.ts out.json (against a running server)
 *
 * Never point SIM_DATA_DIR at the real data/ folder: the scenario creates and
 * deletes profiles.
 */
import fs from 'node:fs';

const outFile = process.argv[2] || 'golden.json';
const PORT = 5299;

type Json = any;

async function main() {
  let base = process.env.GOLDEN_URL;
  // In-process router mode: GOLDEN_ENGINE=sqlite|static (fresh in-memory profile store, no HTTP).
  let routerCall: ((method: string, path: string, body?: unknown) => Promise<{ status: number; body: Json }>) | null = null;
  if (process.env.GOLDEN_ENGINE) {
    const { createRouter } = await import('../src/api/router.ts');
    const { MemoryProfileStore } = await import('../src/api/profileStore.ts');
    const { MarketEngine } = await import('../src/market/marketEngine.ts');
    let engine;
    if (process.env.GOLDEN_ENGINE === 'static') {
      const { StaticDataSource } = await import('../src/market/staticDataSource.ts');
      const dir = process.env.GOLDEN_DATA || 'public/data';
      const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
      engine = new MarketEngine(new StaticDataSource(manifest, async (p) => new Uint8Array(fs.readFileSync(`${dir}/${p}`))));
      engine.maxLoadedSymbols = 40; // exercise lazy loading + eviction
    } else {
      const { SqliteDataSource } = await import('../server/sqliteDataSource.ts');
      engine = new MarketEngine(new SqliteDataSource());
      await engine.loadAll();
    }
    const router = createRouter({ market: engine, store: new MemoryProfileStore() });
    routerCall = async (method, path, body) => {
      const [p, qs] = path.split('?');
      const query = Object.fromEntries(new URLSearchParams(qs || ''));
      return router({ method: method as 'GET', path: p, query, body });
    };
    base = 'router';
  }
  if (!base) {
    if (!process.env.SIM_DATA_DIR) {
      throw new Error('Set SIM_DATA_DIR to a COPY of the data folder (the scenario mutates profiles).');
    }
    process.env.PORT = String(PORT);
    process.env.NODE_ENV = 'production';
    process.env.SIM_NO_LISTEN_LOG = '1';
    await import('../server/index.ts');
    base = `http://localhost:${PORT}`;
    for (let i = 0; i < 200; i++) {
      try {
        const r = await fetch(`${base}/api/sync/status`);
        if (r.ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const log: Array<{ step: string; status: number; body: Json }> = [];
  const call = async (step: string, method: string, path: string, body?: unknown): Promise<Json> => {
    if (routerCall) {
      const r = await routerCall(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
      const json = JSON.parse(JSON.stringify(r.body));
      log.push({ step, status: r.status, body: json });
      return json;
    }
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    log.push({ step, status: res.status, body: json });
    return json;
  };

  await call('bootstrap', 'GET', '/bootstrap');
  const created = await call('create', 'POST', '/profiles/create', {
    name: 'Golden',
    startDate: '2008-01-08',
    startingCapital: 1000000,
  });
  const id: string = created.profile.id;
  const p = (s: string) => `/profiles/${encodeURIComponent(id)}${s}`;
  const cur = () => ([...log].reverse().find((l) => l.body.profile)?.body.profile.currentDate as string) || '2008-01-08';

  const eq = (over: Record<string, unknown>) => ({
    exchange: 'NSE',
    variety: 'REGULAR',
    orderType: 'MARKET',
    validity: 'DAY',
    instrumentType: 'EQ',
    ...over,
  });

  await call('buy RELIANCE CNC', 'POST', p('/orders/place'), eq({ side: 'BUY', product: 'CNC', underlyingSymbol: 'RELIANCE', qty: 10 }));
  await call('buy INFY MIS limit', 'POST', p('/orders/place'), eq({ side: 'BUY', product: 'MIS', orderType: 'LIMIT', underlyingSymbol: 'INFY', qty: 20, price: 1 }));
  await call('buy SBIN MTF', 'POST', p('/orders/place'), eq({ side: 'BUY', product: 'MTF', underlyingSymbol: 'SBIN', qty: 15 }));
  const far = await call('buy TCS far limit', 'POST', p('/orders/place'), eq({ side: 'BUY', product: 'CNC', orderType: 'LIMIT', underlyingSymbol: 'TCS', qty: 5, price: 10 }));
  const openOrd = (far.profile.orders as Json[]).find((o) => o.status === 'OPEN' && o.underlyingSymbol === 'TCS');
  if (openOrd) {
    await call('modify TCS', 'POST', p('/orders/modify'), { orderId: openOrd.id, qty: 6, price: 12 });
    await call('cancel TCS', 'POST', p('/orders/cancel'), { orderId: openOrd.id });
  }

  const chain = await call('fno chain', 'GET', `/fno/chain?symbol=${encodeURIComponent('NIFTY 50')}&date=${cur()}`);
  if (chain.ok) {
    const fut = chain.futures[0];
    await call('buy NIFTY FUT', 'POST', p('/orders/place'), eq({
      side: 'BUY', exchange: 'NFO', product: 'NRML', instrumentType: 'FUT', underlyingSymbol: 'NIFTY 50',
      contractKey: fut.contractKey, displaySymbol: fut.displaySymbol, expiryDate: fut.expiryDate, lotSize: fut.lotSize, qty: fut.lotSize,
    }));
    const opt = chain.options[7];
    await call('buy NIFTY CE', 'POST', p('/orders/place'), eq({
      side: 'BUY', exchange: 'NFO', product: 'NRML', instrumentType: 'CE', underlyingSymbol: 'NIFTY 50',
      contractKey: opt.ce.contractKey, displaySymbol: opt.ce.displaySymbol, strikePrice: opt.strike, expiryDate: opt.expiryDate, lotSize: opt.lotSize, qty: opt.lotSize,
    }));
  }

  const rel = (await call('quotes', 'POST', '/quotes', { symbols: ['RELIANCE', 'NIFTY 50', 'INFY', 'NOPE'], date: cur() })).quotes.RELIANCE;
  await call('gtt OCO', 'POST', p('/gtt/create'), {
    type: 'OCO', symbol: 'RELIANCE', exchange: 'NSE', side: 'SELL', product: 'CNC', ltpAtCreation: rel.ltp,
    legs: [
      { label: 'TARGET', triggerPrice: Math.round(rel.ltp * 1.15), limitPrice: Math.round(rel.ltp * 1.15), qty: 10 },
      { label: 'STOPLOSS', triggerPrice: Math.round(rel.ltp * 0.8), limitPrice: Math.round(rel.ltp * 0.8), qty: 10 },
    ],
  });
  await call('sip', 'POST', p('/sips/save'), {
    name: 'Golden SIP', frequency: 'MONTHLY', dayOfMonth: 5, status: 'ACTIVE',
    allocations: [{ symbol: 'HDFCBANK', mode: 'AMOUNT', value: 10000 }, { symbol: 'NIFTYBEES', mode: 'AMOUNT', value: 5000 }],
  });
  const bsk = await call('basket save', 'POST', p('/baskets/save'), {
    name: 'Golden basket',
    items: [
      { id: 'bi1', side: 'BUY', symbol: 'ITC', exchange: 'NSE', product: 'CNC', orderType: 'MARKET', qty: 30, price: 0, triggerPrice: 0, instrumentType: 'EQ', contractKey: 'ITC', displaySymbol: 'ITC', lotSize: 1 },
      { id: 'bi2', side: 'BUY', symbol: 'WIPRO', exchange: 'NSE', product: 'CNC', orderType: 'MARKET', qty: 12, price: 0, triggerPrice: 0, instrumentType: 'EQ', contractKey: 'WIPRO', displaySymbol: 'WIPRO', lotSize: 1 },
    ],
  });
  const basketId = bsk.profile.baskets[0].id;
  await call('basket execute', 'POST', p(`/baskets/${basketId}/execute`), {});
  await call('meta', 'POST', p('/update-meta'), { autoPause: { pauseOnBigMovePct: 0, pauseOnGttTrigger: false, pauseOnStopLoss: false }, monthlyTopUp: 5000 });

  for (let i = 0; i < 24; i++) await call(`step 1M #${i}`, 'POST', p('/time/step'), { mode: '1M' });
  await call('step 1W', 'POST', p('/time/step'), { mode: '1W' });
  await call('step 1D', 'POST', p('/time/step'), { mode: '1D' });

  await call('intraday on', 'POST', p('/time/toggle-intraday'), { enabled: true });
  await call('step 5m', 'POST', p('/time/step'), { mode: '5m' });
  await call('step 15m', 'POST', p('/time/step'), { mode: '15m' });
  await call('intraday buy MIS', 'POST', p('/orders/place'), eq({ side: 'BUY', product: 'MIS', underlyingSymbol: 'HDFCBANK', qty: 40 }));
  await call('step 1H', 'POST', p('/time/step'), { mode: '1H' });
  const sym = 'RELIANCE';
  const prof = log[log.length - 1].body.profile;
  for (const tf of ['5m', '15m', '1H', '1D', '1W', '1M']) {
    await call(`candles ${tf} intraday`, 'GET', `/candles?symbol=${sym}&date=${prof.currentDate}&tf=${tf}&intraday=true&step=${prof.intraday.stepIndex}`);
  }
  await call('intraday off', 'POST', p('/time/toggle-intraday'), { enabled: false });
  for (const tf of ['1D', '1W', '1M']) {
    await call(`candles ${tf} INFY`, 'GET', `/candles?symbol=INFY&date=${cur()}&tf=${tf}`);
  }

  const afterPos = [...log].reverse().find((l) => l.body.profile)!.body.profile;
  const mtf = (afterPos.positions as Json[]).find((x) => x.product === 'MTF' && x.netQty !== 0);
  if (mtf) await call('convert MTF', 'POST', p('/positions/convert'), { positionId: mtf.id });
  await call('square off all', 'POST', p('/positions/square-off'), {});
  const h0 = (log[log.length - 1].body.profile.holdings as Json[])[0];
  if (h0) await call('pledge', 'POST', p('/holdings/pledge'), { symbol: h0.symbol, pledgeQty: h0.qty });
  await call('funds add', 'POST', p('/funds'), { action: 'ADD', amount: 50000 });
  await call('funds withdraw', 'POST', p('/funds'), { action: 'WITHDRAW', amount: 20000 });

  await call('step 6M', 'POST', p('/time/step'), { mode: '6M' });
  await call('step 1Y', 'POST', p('/time/step'), { mode: '1Y' });
  await call('jump forward', 'POST', p('/time/step'), { mode: 'JUMP', targetDate: '2013-06-15' });
  await call('jump backward (needs reset)', 'POST', p('/time/step'), { mode: 'JUMP', targetDate: '2009-01-01' });
  await call('fno chain BANK', 'GET', `/fno/chain?symbol=${encodeURIComponent('NIFTY BANK')}&date=${cur()}`);

  await call('reset', 'POST', '/profiles/reset', { id, startDate: '2020-03-20', startingCapital: 300000 });
  await call('step 1Y after reset', 'POST', p('/time/step'), { mode: '1Y' });
  await call('load', 'POST', '/profiles/load', { id });
  await call('delete', 'DELETE', `/profiles/${encodeURIComponent(id)}`);

  fs.writeFileSync(outFile, JSON.stringify(normalise(log), null, 1));
  console.log(`golden: ${log.length} calls → ${outFile}`);
  process.exit(0);
}

/** Replace generated ids / wall-clock timestamps with stable placeholders (by first appearance). */
function normalise(v: Json): Json {
  const ids = new Map<string, string>();
  const ID_RE = /^(?:[a-z]{2,6}_[0-9a-z]{5,}(?:_[0-9a-z]+)?|\d{12,}_[0-9a-z]+)$/;
  const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const walk = (x: Json, key?: string): Json => {
    if (Array.isArray(x)) return x.map((y) => walk(y));
    if (x && typeof x === 'object') {
      const out: Json = {};
      for (const k of Object.keys(x)) {
        if (k === 'profilesList') continue; // depends on unrelated stored profiles / wall-clock ordering
        out[k] = walk(x[k], k);
      }
      return out;
    }
    if (typeof x === 'string') {
      if (TS_RE.test(x) && (key === 'createdAt' || key === 'updatedAt')) return '<ts>';
      const s = x.replace(/[a-z]{2,6}_[0-9a-z]{5,}(?:_[0-9a-z]+)?/g, (m) => {
        if (!ID_RE.test(m)) return m;
        if (!ids.has(m)) ids.set(m, `<id${ids.size}>`);
        return ids.get(m)!;
      });
      return s;
    }
    return x;
  };
  return walk(v);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
