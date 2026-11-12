/// <reference lib="webworker" />
/**
 * Runs the whole simulator (market engine + API router) on the device, so the app works offline
 * with no PC server. The UI talks to it through src/api/client.ts.
 */
import { createRouter, type ApiRequest, type ApiResponse } from '../api/router.ts';
import { IdbProfileStore } from '../api/idbProfileStore.ts';
import { MarketEngine } from '../market/marketEngine.ts';
import { StaticDataSource, type DataManifest } from '../market/staticDataSource.ts';
import { cachedBytes, loadManifest, prefetchAll, rememberDataAsOf } from './dataCache.ts';

declare const self: DedicatedWorkerGlobalScope;

let routerPromise: Promise<(req: ApiRequest) => Promise<ApiResponse>> | null = null;
let manifest: DataManifest | null = null;
let prefetching = false;

function post(event: unknown) {
  self.postMessage({ type: 'event', event });
}

async function setup() {
  const m = await loadManifest();
  manifest = m.manifest;
  const engine = new MarketEngine(new StaticDataSource(m.manifest, cachedBytes));
  engine.maxLoadedSymbols = 150;
  await engine.init();
  const router = createRouter({ market: engine, store: new IdbProfileStore() });
  const updated = Boolean(m.previousDataAsOf && m.previousDataAsOf !== m.manifest.dataAsOf);
  post({
    type: 'data-ready',
    dataAsOf: m.manifest.dataAsOf,
    updated,
    previousDataAsOf: m.previousDataAsOf,
    offline: m.offline,
  });
  await rememberDataAsOf(m.manifest.dataAsOf);
  // Download everything else in the background so the app works fully offline.
  setTimeout(() => void startPrefetch(), 1500);
  return router;
}

async function startPrefetch() {
  if (!manifest || prefetching) return;
  prefetching = true;
  try {
    await prefetchAll(manifest, (p) => post({ type: 'data-progress', ...p }));
  } finally {
    prefetching = false;
  }
}

function getRouter() {
  if (!routerPromise) {
    routerPromise = setup().catch((err) => {
      routerPromise = null;
      post({ type: 'data-error', message: (err as Error).message });
      throw err;
    });
  }
  return routerPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg?.type === 'prefetch') {
    void startPrefetch();
    return;
  }
  if (msg?.type !== 'req') return;
  let res: ApiResponse;
  try {
    const router = await getRouter();
    res = await router(msg.req as ApiRequest);
  } catch (err) {
    res = { status: 503, body: { ok: false, message: (err as Error).message } };
  }
  self.postMessage({ type: 'res', id: msg.id, res });
};

// Start loading immediately.
void getRouter().catch(() => undefined);
