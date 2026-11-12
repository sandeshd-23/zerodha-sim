/**
 * Offline market-data cache (Cache Storage), used by the engine worker.
 * Content-hashed files are cache-first forever; manifest.json is network-first with a short timeout.
 */
import { StaticDataSource, type DataManifest } from '../market/staticDataSource.ts';

const CACHE = 'kite-data-v1';
const MANIFEST_KEY = 'manifest.json';
const LAST_SEEN_KEY = '__last_data_as_of__';

export const DATA_ROOT = new URL(`${import.meta.env.BASE_URL}data/`, self.location.origin).toString();

const url = (path: string) => new URL(path, DATA_ROOT).toString();

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    return null; // e.g. Cache Storage unavailable (private mode) – fall back to plain network
  }
}

export async function cachedBytes(path: string): Promise<Uint8Array> {
  const cache = await openCache();
  const u = url(path);
  if (cache) {
    const hit = await cache.match(u);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Failed to download ${path} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  if (cache) {
    await cache.put(u, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => undefined);
  }
  return new Uint8Array(buf);
}

export interface ManifestResult {
  manifest: DataManifest;
  offline: boolean;
  previousDataAsOf?: string;
}

export async function loadManifest(timeoutMs = 4000): Promise<ManifestResult> {
  const cache = await openCache();
  const cachedRes = cache ? await cache.match(url(MANIFEST_KEY)) : undefined;
  const cached = cachedRes ? ((await cachedRes.json()) as DataManifest) : undefined;
  const previousDataAsOf = cache ? await readMarker(cache) : undefined;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cached ? timeoutMs : 60000);
    const res = await fetch(url(MANIFEST_KEY), { cache: 'no-cache', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fresh = (await res.json()) as DataManifest;
    if (cache) await cache.put(url(MANIFEST_KEY), new Response(JSON.stringify(fresh), { headers: { 'Content-Type': 'application/json' } }));
    return { manifest: fresh, offline: false, previousDataAsOf };
  } catch (err) {
    if (cached) return { manifest: cached, offline: true, previousDataAsOf };
    throw new Error(
      `Could not download market data (${(err as Error).message}). Connect to the internet once to set up offline mode.`
    );
  }
}

async function readMarker(cache: Cache): Promise<string | undefined> {
  const r = await cache.match(url(LAST_SEEN_KEY));
  return r ? (await r.text()) || undefined : undefined;
}

export async function rememberDataAsOf(dataAsOf: string): Promise<void> {
  const cache = await openCache();
  if (cache) await cache.put(url(LAST_SEEN_KEY), new Response(dataAsOf));
}

/** Download every data file not yet cached, then delete cached files the manifest no longer uses. */
export async function prefetchAll(
  manifest: DataManifest,
  onProgress: (p: { done: number; total: number; bytesDone: number; bytesTotal: number }) => void
): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const files = StaticDataSource.allFiles(manifest);
  const bytesTotal = files.reduce((a, f) => a + f.bytes, 0);
  let done = 0;
  let bytesDone = 0;
  const queue = [...files];
  const missing: typeof files = [];
  for (const f of files) {
    if (await cache.match(url(f.path))) {
      done += 1;
      bytesDone += f.bytes;
    } else missing.push(f);
  }
  onProgress({ done, total: files.length, bytesDone, bytesTotal });
  queue.length = 0;
  queue.push(...missing);
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift()!;
      try {
        await cachedBytes(f.path);
      } catch {
        /* retried on the next launch */
      }
      done += 1;
      bytesDone += f.bytes;
      onProgress({ done, total: files.length, bytesDone, bytesTotal });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // prune files from older data versions
  const keep = new Set([...files.map((f) => url(f.path)), url(MANIFEST_KEY), url(LAST_SEEN_KEY)]);
  for (const req of await cache.keys()) {
    if (!keep.has(req.url)) await cache.delete(req);
  }
}
