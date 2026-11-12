import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Instrument, SimulationProfile } from '../src/types/simulator.ts';
import { buildUniverse } from './universeBuilder.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SIM_DATA_DIR
  ? path.resolve(process.env.SIM_DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'simulator.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT PRIMARY KEY,
    yahoo_ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    blind_symbol TEXT NOT NULL,
    blind_name TEXT NOT NULL,
    exchange TEXT NOT NULL,
    sector TEXT NOT NULL,
    lot_size INTEGER NOT NULL DEFAULT 1,
    is_index INTEGER NOT NULL DEFAULT 0,
    is_etf INTEGER NOT NULL DEFAULT 0,
    first_date TEXT,
    last_date TEXT,
    bar_count INTEGER DEFAULT 0,
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_bars (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  CREATE INDEX IF NOT EXISTS idx_daily_bars_date ON daily_bars(date);

  CREATE TABLE IF NOT EXISTS splits (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    numerator REAL NOT NULL,
    denominator REAL NOT NULL,
    ratio TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  CREATE TABLE IF NOT EXISTS dividends (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    state_json TEXT NOT NULL
  );
`);

export function seedDefaultInstruments(list: Instrument[] = buildUniverse()): void {
  const upsert = db.prepare(`
    INSERT INTO instruments (
      symbol, yahoo_ticker, name, blind_symbol, blind_name,
      exchange, sector, lot_size, is_index, is_etf
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      yahoo_ticker = excluded.yahoo_ticker,
      name = excluded.name,
      sector = excluded.sector,
      lot_size = excluded.lot_size,
      is_index = excluded.is_index,
      is_etf = excluded.is_etf
  `);

  db.exec('BEGIN');
  try {
    for (const inst of list) {
      upsert.run(
        inst.symbol,
        inst.yahooTicker,
        inst.name,
        inst.blindSymbol,
        inst.blindName,
        inst.exchange,
        inst.sector,
        inst.lotSize,
        inst.isIndex ? 1 : 0,
        inst.isEtf ? 1 : 0
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getAllInstruments(): Instrument[] {
  const rows = db
    .prepare(
      `SELECT symbol, yahoo_ticker, name, blind_symbol, blind_name, exchange, sector, lot_size, is_index, is_etf, first_date, last_date
       FROM instruments
       WHERE bar_count > 0
       ORDER BY is_index DESC, is_etf DESC, symbol ASC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    symbol: String(r.symbol),
    yahooTicker: String(r.yahoo_ticker),
    name: String(r.name),
    blindSymbol: String(r.blind_symbol),
    blindName: String(r.blind_name),
    exchange: r.exchange as Instrument['exchange'],
    sector: String(r.sector),
    lotSize: Number(r.lot_size) || 1,
    isIndex: Boolean(r.is_index),
    isEtf: Boolean(r.is_etf),
    firstDate: r.first_date ? String(r.first_date) : undefined,
    lastDate: r.last_date ? String(r.last_date) : undefined,
  }));
}

/** Every seeded instrument, synced or not (used by full re-syncs). */
export function getSeededInstruments(): Instrument[] {
  const rows = db
    .prepare(
      `SELECT symbol, yahoo_ticker, name, blind_symbol, blind_name, exchange, sector, lot_size, is_index, is_etf
       FROM instruments ORDER BY symbol ASC`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    symbol: String(r.symbol),
    yahooTicker: String(r.yahoo_ticker),
    name: String(r.name),
    blindSymbol: String(r.blind_symbol),
    blindName: String(r.blind_name),
    exchange: r.exchange as Instrument['exchange'],
    sector: String(r.sector),
    lotSize: Number(r.lot_size) || 1,
    isIndex: Boolean(r.is_index),
    isEtf: Boolean(r.is_etf),
  }));
}

export function getUnsyncedInstruments(): Instrument[] {
  const rows = db
    .prepare(
      `SELECT symbol, yahoo_ticker, name, blind_symbol, blind_name, exchange, sector, lot_size, is_index, is_etf
       FROM instruments
       WHERE synced_at IS NULL OR bar_count = 0`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    symbol: String(r.symbol),
    yahooTicker: String(r.yahoo_ticker),
    name: String(r.name),
    blindSymbol: String(r.blind_symbol),
    blindName: String(r.blind_name),
    exchange: r.exchange as Instrument['exchange'],
    sector: String(r.sector),
    lotSize: Number(r.lot_size) || 1,
    isIndex: Boolean(r.is_index),
    isEtf: Boolean(r.is_etf),
  }));
}

export function saveProfile(profile: SimulationProfile): void {
  const now = new Date().toISOString();
  profile.updatedAt = now;
  db.prepare(
    `INSERT INTO profiles (id, name, created_at, updated_at, state_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       updated_at = excluded.updated_at,
       state_json = excluded.state_json`
  ).run(profile.id, profile.name, profile.createdAt || now, now, JSON.stringify(profile));
}

export function listProfiles(): Array<{ id: string; name: string; updatedAt: string; currentDate: string; startingCapital: number }> {
  const rows = db.prepare(`SELECT id, name, updated_at, state_json FROM profiles ORDER BY updated_at DESC`).all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => {
    let currentDate = '2015-01-01';
    let startingCapital = 200000;
    try {
      const parsed = JSON.parse(String(r.state_json)) as Partial<SimulationProfile>;
      if (parsed.currentDate) currentDate = parsed.currentDate;
      if (parsed.startingCapital) startingCapital = parsed.startingCapital;
    } catch {
      // ignore parse fallback
    }
    return {
      id: String(r.id),
      name: String(r.name),
      updatedAt: String(r.updated_at),
      currentDate,
      startingCapital,
    };
  });
}

export function getProfileById(id: string): SimulationProfile | null {
  const row = db.prepare(`SELECT state_json FROM profiles WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return JSON.parse(String(row.state_json)) as SimulationProfile;
}

export function deleteProfileById(id: string): void {
  db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id);
}
