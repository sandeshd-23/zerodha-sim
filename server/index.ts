/**
 * PC server: serves the app and the simulator API from SQLite.
 *
 * The API logic lives in src/api/router.ts and is shared with the offline PWA (which runs the same
 * router inside a Web Worker). Only the Yahoo-backed routes (remote search, adding new tickers,
 * background sync) are server-only.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDefaultInstruments } from './db.ts';
import { marketEngine } from './marketEngine.ts';
import { SqliteProfileStore } from './sqliteProfileStore.ts';
import { addAndSyncCustomTicker, searchRemoteIndianStocks, syncStatus, syncUniverse } from './yahooSync.ts';
import { createRouter, type HttpMethod } from '../src/api/router.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);

async function startServer() {
  seedDefaultInstruments();
  await marketEngine.loadAll();

  // Trigger non-blocking background sync if very few instruments are synced
  if (marketEngine.getInstruments().length < 20 && !syncStatus.running) {
    syncUniverse({ concurrency: 8 }).then(async () => {
      await marketEngine.reinit();
      await marketEngine.loadAll();
      console.log('[KiteSimulator] Background historical market sync completed.');
    });
  }

  const router = createRouter({
    market: marketEngine,
    store: new SqliteProfileStore(),
    getSyncStatus: () => syncStatus,
  });

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // === SERVER-ONLY: SYNC STATUS & TRIGGER ===
  app.get('/api/sync/status', (_req, res) => {
    res.json({
      syncStatus,
      instrumentCount: marketEngine.getInstruments().length,
    });
  });

  app.post('/api/sync/trigger', (_req, res) => {
    if (!syncStatus.running) {
      syncUniverse({ concurrency: 8 }).then(async () => {
        await marketEngine.reinit();
        await marketEngine.loadAll();
      });
    }
    res.json({ ok: true, syncStatus });
  });

  // === SERVER-ONLY: SEARCH & CUSTOM TICKER SYNC (Yahoo has no CORS, so the phone can't do this) ===
  app.get('/api/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const upper = q.toUpperCase();
    const local = marketEngine
      .getInstruments()
      .filter(
        (i) =>
          i.symbol.toUpperCase().includes(upper) ||
          i.name.toUpperCase().includes(upper) ||
          i.sector.toUpperCase().includes(upper)
      )
      .slice(0, 20);

    let remote: Awaited<ReturnType<typeof searchRemoteIndianStocks>> = [];
    if (q.length >= 2) {
      remote = (await searchRemoteIndianStocks(q)).filter(
        (r) => !local.some((l) => l.yahooTicker.toUpperCase() === r.yahooTicker.toUpperCase())
      );
    }
    res.json({ local, remote });
  });

  app.post('/api/instruments/add', async (req, res) => {
    try {
      const { symbol, yahooTicker, name, exchange } = req.body as {
        symbol: string;
        yahooTicker: string;
        name?: string;
        exchange?: 'NSE' | 'BSE' | 'US/GLOBAL';
      };
      if (!symbol || !yahooTicker) {
        res.status(400).json({ ok: false, message: 'symbol and yahooTicker are required' });
        return;
      }
      const inst = await addAndSyncCustomTicker({ symbol, yahooTicker, name, exchange });
      await marketEngine.reloadSymbol(inst.symbol);
      res.json({ ok: true, instrument: inst, instruments: marketEngine.getInstruments() });
    } catch (err) {
      res.status(500).json({ ok: false, message: (err as Error).message });
    }
  });

  // === EVERYTHING ELSE: SHARED ROUTER ===
  app.all('/api/*', async (req, res) => {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') query[k] = v;
    const result = await router({
      method: req.method as HttpMethod,
      path: req.path.replace(/^\/api/, ''),
      query,
      body: req.body,
    });
    res.status(result.status).json(result.body);
  });

  // === VITE DEV / STATIC PROD ===
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      define: { 'import.meta.env.VITE_API_MODE': JSON.stringify('http') },
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    const bounds = marketEngine.getCalendarBounds();
    console.log(`\n🚀 Zerodha Kite 25-Year Historical Simulator live at http://localhost:${PORT}`);
    console.log(
      `📊 Loaded ${marketEngine.getInstruments().length} NSE/BSE instruments (${bounds.minDate} to ${bounds.maxDate}, ${bounds.totalTradingDays.toLocaleString()} trading days)\n`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start simulator server:', err);
  process.exit(1);
});
