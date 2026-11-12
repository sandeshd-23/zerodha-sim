// The engine itself lives in src/market/marketEngine.ts (shared with the offline PWA worker).
// On the PC it reads from SQLite.
import { MarketEngine } from '../src/market/marketEngine.ts';
import { SqliteDataSource } from './sqliteDataSource.ts';

export type { DayStepBar, DayStepPacket, SymbolSeries } from '../src/market/types.ts';
export { MarketEngine };

export const marketEngine = new MarketEngine(new SqliteDataSource());
