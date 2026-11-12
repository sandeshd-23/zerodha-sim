/**
 * Talks to the simulator API.
 *  - 'worker' (default, offline PWA): the whole engine runs in a Web Worker on the device.
 *  - 'http' (`npm run dev:server`): the PC Express server.
 */
import type { ApiRequest, ApiResponse, HttpMethod } from './router.ts';

export type ApiMode = 'worker' | 'http';
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'worker';

export interface DataProgressEvent {
  type: 'data-progress';
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}
export interface DataReadyEvent {
  type: 'data-ready';
  dataAsOf: string;
  /** True when this launch picked up newer prices than the previous launch. */
  updated: boolean;
  previousDataAsOf?: string;
  offline: boolean;
}
export interface DataErrorEvent {
  type: 'data-error';
  message: string;
}
export type WorkerEvent = DataProgressEvent | DataReadyEvent | DataErrorEvent;

type Pending = { resolve: (r: ApiResponse) => void; reject: (e: unknown) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const listeners = new Set<(e: WorkerEvent) => void>();
const eventBacklog: WorkerEvent[] = [];

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type === 'res') {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve(msg.res);
      }
    } else if (msg?.type === 'event') {
      if (listeners.size === 0) eventBacklog.push(msg.event);
      for (const l of listeners) l(msg.event);
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Simulator engine crashed');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  return worker;
}

export function onWorkerEvent(cb: (e: WorkerEvent) => void): () => void {
  listeners.add(cb);
  while (eventBacklog.length) cb(eventBacklog.shift()!);
  return () => listeners.delete(cb);
}

/** Ask the worker to (re)start downloading all offline data. */
export function requestPrefetch(): void {
  if (API_MODE === 'worker') getWorker().postMessage({ type: 'prefetch' });
}

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

export async function api<T = any>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>
): Promise<ApiResult<T>> {
  const q: Record<string, string> = {};
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) q[k] = String(v);

  let res: ApiResponse;
  if (API_MODE === 'http') {
    const qs = Object.keys(q).length ? `?${new URLSearchParams(q).toString()}` : '';
    const r = await fetch(`${import.meta.env.BASE_URL}api${path}${qs}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    res = { status: r.status, body: await r.json() };
  } else {
    const w = getWorker();
    const id = ++seq;
    const req: ApiRequest = { method, path, query: q, body };
    res = await new Promise<ApiResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ type: 'req', id, req });
    });
  }
  return { ok: res.status < 400 && res.body?.ok !== false, status: res.status, data: res.body as T };
}
