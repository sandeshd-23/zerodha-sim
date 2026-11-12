import { syncUniverse } from './yahooSync.ts';
import { db } from './db.ts';

async function main() {
  console.log('Starting 25+ Year NSE/BSE Historical Market Sync (2000 - Present)...');
  const t0 = Date.now();
  let lastLogged = 0;

  const status = await syncUniverse({
    concurrency: 4,
    onProgress: (s) => {
      if (s.completed - lastLogged >= 15 || s.completed === s.total) {
        lastLogged = s.completed;
        console.log(`  [${s.completed}/${s.total}] Synced... (latest: ${s.currentSymbol})`);
      }
    },
  });

  const barCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM daily_bars`).get() as { cnt: number };
  const splitCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM splits`).get() as { cnt: number };
  const divCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM dividends`).get() as { cnt: number };

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSync finished in ${elapsedSec}s!`);
  console.log(`  Instruments synced: ${status.completed - status.failed.length}/${status.total}`);
  if (status.failed.length > 0) {
    console.log(`  Failed tickers (${status.failed.length}): ${status.failed.join(', ')}`);
  }
  console.log(`  Total Daily OHLCV Bars: ${barCountRow.cnt.toLocaleString()}`);
  console.log(`  Total Stock Splits:     ${splitCountRow.cnt.toLocaleString()}`);
  console.log(`  Total Dividend Events:  ${divCountRow.cnt.toLocaleString()}`);
}

main().catch((err) => {
  console.error('Sync error:', err);
  process.exit(1);
});
