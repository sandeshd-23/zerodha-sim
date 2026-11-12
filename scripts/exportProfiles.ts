/**
 * Exports the timelines saved on this PC (SQLite) into profiles-backup.json.
 * Copy the file to your phone and use Profile → Import backup in the installed app.
 */
import fs from 'node:fs';
import { getProfileById, listProfiles } from '../server/db.ts';

const out = process.argv[2] || 'profiles-backup.json';
const profiles = listProfiles()
  .map((s) => getProfileById(s.id))
  .filter(Boolean);
fs.writeFileSync(
  out,
  JSON.stringify({ ok: true, format: 'kite-sim-backup', version: 1, exportedAt: new Date().toISOString(), profiles }, null, 1)
);
console.log(`Exported ${profiles.length} timeline(s) → ${out}`);
