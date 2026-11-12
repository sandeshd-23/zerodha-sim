/**
 * Compact binary format for daily bars ("KSB1"), shared by the Node exporter and the browser.
 *
 * Layout (little-endian):
 *   magic "KSB1" | version u16 | flags u16 | n u32 | firstDay i32 | deltaBytes u32
 *   day deltas: u8 each (255 = escape, followed by u16)
 *   open, high, low, close: n × f32 (or f64 when flags&2), byte-shuffled (all byte0s, then byte1s, …)
 *   volume: n × u32 (or f64 when flags&1), byte-shuffled
 *
 * Byte-shuffling groups similar bytes together so gzip compresses ~25% better. All decoding is exact:
 * prices are only stored as f32 when every value round-trips through Math.fround unchanged.
 *
 * Tail bundle ("KST1"): many symbols' recent bars in one file:
 *   magic "KST1" | count u32 | repeat { symLen u16 | sym utf8 | len u32 | KSB1 bytes }
 */
import type { SeriesColumns } from './types.ts';

const MAGIC_SHARD = 0x3142534b; // "KSB1"
const MAGIC_TAIL = 0x3154534b; // "KST1"
const FLAG_VOL_F64 = 1;
const FLAG_PRICE_F64 = 2;

// ---- dates ------------------------------------------------------------------------------------

const DAY_MS = 86400000;
const dayStrCache = new Map<number, string>();

export function isoToDay(iso: string): number {
  return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS);
}

/** Interned ISO date strings, so thousands of series share the same string objects. */
export function dayToIso(day: number): string {
  let s = dayStrCache.get(day);
  if (!s) {
    s = new Date(day * DAY_MS).toISOString().slice(0, 10);
    dayStrCache.set(day, s);
  }
  return s;
}

// ---- shards -----------------------------------------------------------------------------------

function allF32(arr: ArrayLike<number>): boolean {
  for (let i = 0; i < arr.length; i++) if (Math.fround(arr[i]) !== arr[i]) return false;
  return true;
}

function allU32(arr: ArrayLike<number>): boolean {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!(v >= 0 && v <= 0xffffffff && Math.floor(v) === v)) return false;
  }
  return true;
}

function shuffle(bytes: Uint8Array, width: number, out: Uint8Array, offset: number): void {
  const n = bytes.length / width;
  for (let b = 0; b < width; b++) {
    const base = offset + b * n;
    for (let i = 0; i < n; i++) out[base + i] = bytes[i * width + b];
  }
}

function unshuffle(src: Uint8Array, offset: number, n: number, width: number): Uint8Array {
  const out = new Uint8Array(n * width);
  for (let b = 0; b < width; b++) {
    const base = offset + b * n;
    for (let i = 0; i < n; i++) out[i * width + b] = src[base + i];
  }
  return out;
}

export function encodeShard(cols: SeriesColumns): Uint8Array {
  const n = cols.dates.length;
  const days = cols.dates.map(isoToDay);
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = days[i] - days[i - 1];
    if (d <= 0 || d > 0xffff) throw new Error(`Bad date ordering at ${cols.dates[i]}`);
    if (d < 255) deltas.push(d);
    else deltas.push(255, d & 0xff, d >> 8);
  }
  const priceF64 = ![cols.opens, cols.highs, cols.lows, cols.closes].every(allF32);
  const volF64 = !allU32(cols.volumes);
  const pw = priceF64 ? 8 : 4;
  const vw = volF64 ? 8 : 4;
  const header = 20;
  const total = header + deltas.length + 4 * n * pw + n * vw;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC_SHARD, true);
  dv.setUint16(4, 1, true);
  dv.setUint16(6, (volF64 ? FLAG_VOL_F64 : 0) | (priceF64 ? FLAG_PRICE_F64 : 0), true);
  dv.setUint32(8, n, true);
  dv.setInt32(12, n > 0 ? days[0] : 0, true);
  dv.setUint32(16, deltas.length, true);
  out.set(deltas, header);
  let off = header + deltas.length;
  for (const col of [cols.opens, cols.highs, cols.lows, cols.closes]) {
    const typed = priceF64 ? Float64Array.from(col) : Float32Array.from(col);
    shuffle(new Uint8Array(typed.buffer), pw, out, off);
    off += n * pw;
  }
  const vt = volF64 ? Float64Array.from(cols.volumes) : Uint32Array.from(cols.volumes);
  shuffle(new Uint8Array(vt.buffer), vw, out, off);
  return out;
}

export function decodeShard(buf: Uint8Array): SeriesColumns {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC_SHARD) throw new Error('Not a KSB1 shard');
  const flags = dv.getUint16(6, true);
  const n = dv.getUint32(8, true);
  const firstDay = dv.getInt32(12, true);
  const deltaBytes = dv.getUint32(16, true);
  const dates = new Array<string>(n);
  let p = 20;
  let day = firstDay;
  if (n > 0) dates[0] = dayToIso(day);
  for (let i = 1; i < n; i++) {
    let d = buf[p++];
    if (d === 255) {
      d = buf[p] | (buf[p + 1] << 8);
      p += 2;
    }
    day += d;
    dates[i] = dayToIso(day);
  }
  if (p !== 20 + deltaBytes) throw new Error('Corrupt shard (delta stream)');
  const pw = flags & FLAG_PRICE_F64 ? 8 : 4;
  const vw = flags & FLAG_VOL_F64 ? 8 : 4;
  const readCol = (width: number, kind: 'f' | 'u') => {
    const bytes = unshuffle(buf, p, n, width);
    p += n * width;
    if (width === 8) return new Float64Array(bytes.buffer);
    return kind === 'f' ? new Float32Array(bytes.buffer) : new Uint32Array(bytes.buffer);
  };
  const opens = readCol(pw, 'f') as Float32Array | Float64Array;
  const highs = readCol(pw, 'f') as Float32Array | Float64Array;
  const lows = readCol(pw, 'f') as Float32Array | Float64Array;
  const closes = readCol(pw, 'f') as Float32Array | Float64Array;
  const volumes = readCol(vw, 'u') as Uint32Array | Float64Array;
  return { dates, opens, highs, lows, closes, volumes };
}

// ---- tail bundle --------------------------------------------------------------------------------

export function encodeTail(entries: Array<[string, SeriesColumns]>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let total = 8;
  for (const [sym, cols] of entries) {
    const s = enc.encode(sym);
    const shard = encodeShard(cols);
    const head = new Uint8Array(2 + s.length + 4);
    const hv = new DataView(head.buffer);
    hv.setUint16(0, s.length, true);
    head.set(s, 2);
    hv.setUint32(2 + s.length, shard.length, true);
    parts.push(head, shard);
    total += head.length + shard.length;
  }
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC_TAIL, true);
  dv.setUint32(4, entries.length, true);
  let off = 8;
  for (const part of parts) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

export function decodeTail(buf: Uint8Array): Map<string, SeriesColumns> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC_TAIL) throw new Error('Not a KST1 tail bundle');
  const count = dv.getUint32(4, true);
  const dec = new TextDecoder();
  const out = new Map<string, SeriesColumns>();
  let off = 8;
  for (let i = 0; i < count; i++) {
    const sl = dv.getUint16(off, true);
    const sym = dec.decode(buf.subarray(off + 2, off + 2 + sl));
    const len = dv.getUint32(off + 2 + sl, true);
    const start = off + 6 + sl;
    // copy so typed-array views inside are aligned
    out.set(sym, decodeShard(buf.slice(start, start + len)));
    off = start + len;
  }
  return out;
}

/** Concatenate two column sets (frozen history + recent tail). */
export function concatColumns(a: SeriesColumns | undefined, b: SeriesColumns | undefined): SeriesColumns | undefined {
  if (!a || a.dates.length === 0) return b;
  if (!b || b.dates.length === 0) return a;
  const n = a.dates.length + b.dates.length;
  const priceF64 = a.opens instanceof Float64Array || b.opens instanceof Float64Array;
  const volF64 = a.volumes instanceof Float64Array || b.volumes instanceof Float64Array;
  const price = (x: ArrayLike<number>, y: ArrayLike<number>) => {
    const out = priceF64 ? new Float64Array(n) : new Float32Array(n);
    out.set(x, 0);
    out.set(y, x.length);
    return out;
  };
  const vol = (x: ArrayLike<number>, y: ArrayLike<number>) => {
    const out = volF64 ? new Float64Array(n) : new Uint32Array(n);
    out.set(x, 0);
    out.set(y, x.length);
    return out;
  };
  return {
    dates: a.dates.concat(b.dates),
    opens: price(a.opens, b.opens),
    highs: price(a.highs, b.highs),
    lows: price(a.lows, b.lows),
    closes: price(a.closes, b.closes),
    volumes: vol(a.volumes, b.volumes),
  };
}

// ---- gzip ---------------------------------------------------------------------------------------

export function isGzip(buf: Uint8Array): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Gunzip using the platform's DecompressionStream (browsers, Node 18+). No-op if not gzipped. */
export async function gunzipIfNeeded(buf: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(buf)) return buf;
  const stream = new Blob([buf as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
