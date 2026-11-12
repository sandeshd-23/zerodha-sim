/**
 * Builds the instrument universe:
 *   1. curated list in universe.ts (indices, ETFs, hand-tuned names / lot sizes / ticker overrides)
 *   2. universe/extra.csv  (your own additions)
 *   3. universe/nifty500.csv (NSE NIFTY 500 constituents)
 * Lot sizes for new symbols come from universe/fo_lots.csv (NSE F&O list); stocks without F&O get lot 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Instrument } from '../src/types/simulator.ts';
import { DEFAULT_UNIVERSE } from './universe.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIVERSE_DIR = path.resolve(__dirname, '..', 'universe');

const INDUSTRY_TO_SECTOR: Record<string, string> = {
  'Financial Services': 'Financials',
  'Capital Goods': 'Capital Goods',
  Healthcare: 'Pharma',
  'Automobile and Auto Components': 'Auto',
  'Fast Moving Consumer Goods': 'FMCG',
  Chemicals: 'Chemicals',
  'Information Technology': 'IT',
  'Consumer Services': 'Consumer',
  'Metals & Mining': 'Metals',
  'Oil Gas & Consumable Fuels': 'Energy',
  Power: 'Power',
  'Consumer Durables': 'Consumer',
  Realty: 'Realty',
  Services: 'Services',
  Construction: 'Infra & Cement',
  Telecommunication: 'Telecom',
  'Construction Materials': 'Infra & Cement',
  Textiles: 'Textiles',
  'Media Entertainment & Publication': 'Media',
  Diversified: 'Diversified',
};

/** Minimal CSV parser (handles quoted fields and '#' comment lines). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === ',' && !q) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function readCsv(file: string): Array<Record<string, string>> {
  const p = path.join(UNIVERSE_DIR, file);
  return fs.existsSync(p) ? parseCsv(fs.readFileSync(p, 'utf8')) : [];
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sectorPrefix(sector: string): string {
  return sector
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function buildUniverse(): Instrument[] {
  const out: Instrument[] = [...DEFAULT_UNIVERSE];
  const bySymbol = new Set(out.map((i) => i.symbol));
  const byTicker = new Set(out.map((i) => i.yahooTicker.toUpperCase()));
  const usedBlind = new Set(out.map((i) => i.blindSymbol));

  const lots = new Map<string, number>();
  for (const r of readCsv('fo_lots.csv')) {
    const n = Number(r.lotSize);
    if (r.symbol && n > 0) lots.set(r.symbol.toUpperCase(), n);
  }

  const add = (raw: { symbol: string; yahooTicker?: string; name?: string; sector?: string; lotSize?: number }) => {
    const symbol = raw.symbol.trim().toUpperCase();
    if (!symbol) return;
    const yahooTicker = (raw.yahooTicker || `${symbol}.NS`).trim().toUpperCase();
    if (bySymbol.has(symbol) || byTicker.has(yahooTicker)) return;
    const sector = raw.sector?.trim() || 'Equity';
    const isIndex = sector === 'Indices' || yahooTicker.startsWith('^');
    const isEtf = sector === 'ETF';
    const prefix = isIndex ? 'IDX' : isEtf ? 'ETF' : sectorPrefix(sector) || 'EQTY';
    // Stable masked code from the symbol itself, so adding stocks never reshuffles blind names.
    let code = 1000 + (fnv1a(`kite-sim:${symbol}`) % 9000);
    while (usedBlind.has(`${prefix}-${code}`)) code = code >= 9999 ? 1000 : code + 1;
    const blindSymbol = `${prefix}-${code}`;
    usedBlind.add(blindSymbol);
    out.push({
      symbol,
      yahooTicker,
      name: cleanName(raw.name || symbol),
      blindSymbol,
      blindName: isIndex ? `Market Benchmark Index #${code}` : isEtf ? `${sector} Passive Fund #${code}` : `${sector} Company #${code}`,
      exchange: isIndex ? 'INDICES' : yahooTicker.endsWith('.BO') ? 'BSE' : 'NSE',
      sector,
      lotSize: raw.lotSize && raw.lotSize > 0 ? Math.floor(raw.lotSize) : lots.get(symbol) || 1,
      isIndex,
      isEtf,
    });
    bySymbol.add(symbol);
    byTicker.add(yahooTicker);
  };

  for (const r of readCsv('extra.csv')) {
    add({
      symbol: r.symbol,
      yahooTicker: r.yahooTicker || undefined,
      name: r.name || undefined,
      sector: r.sector || undefined,
      lotSize: r.lotSize ? Number(r.lotSize) : undefined,
    });
  }

  for (const r of readCsv('nifty500.csv')) {
    if (r.Series && r.Series !== 'EQ') continue;
    const industry = r.Industry || '';
    let sector = INDUSTRY_TO_SECTOR[industry] || industry || 'Equity';
    if (industry === 'Financial Services' && /\bbank\b/i.test(r['Company Name'] || '')) sector = 'Banking';
    add({ symbol: r.Symbol, name: r['Company Name'], sector });
  }

  return out;
}
