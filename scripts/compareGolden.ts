/** Compare two golden recordings: tsx scripts/compareGolden.ts a.json b.json */
import fs from 'node:fs';

const [aFile, bFile] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(aFile, 'utf8'));
const b = JSON.parse(fs.readFileSync(bFile, 'utf8'));
// Extra keys to ignore, e.g. GOLDEN_IGNORE=history,foo
const IGNORE = new Set([
  'capabilities',
  'dataAsOf',
  ...(process.env.GOLDEN_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const diffs: string[] = [];
function cmp(x: unknown, y: unknown, path: string) {
  if (diffs.length > 40) return;
  if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) {
    diffs.push(`${path}: type ${JSON.stringify(x)?.slice(0, 80)} vs ${JSON.stringify(y)?.slice(0, 80)}`);
    return;
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) diffs.push(`${path}: length ${x.length} vs ${y.length}`);
    for (let i = 0; i < Math.min(x.length, y.length); i++) cmp(x[i], y[i], `${path}[${i}]`);
    return;
  }
  if (x && typeof x === 'object') {
    const xo = x as Record<string, unknown>;
    const yo = y as Record<string, unknown>;
    const keys = new Set([...Object.keys(xo), ...Object.keys(yo)]);
    for (const k of keys) {
      if (IGNORE.has(k)) continue;
      if (!(k in xo)) diffs.push(`${path}.${k}: missing in A`);
      else if (!(k in yo)) diffs.push(`${path}.${k}: missing in B`);
      else cmp(xo[k], yo[k], `${path}.${k}`);
    }
    return;
  }
  if (x !== y) diffs.push(`${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
}

for (let i = 0; i < Math.max(a.length, b.length); i++) {
  cmp(a[i], b[i], `#${i}(${a[i]?.step ?? b[i]?.step})`);
}
if (diffs.length === 0) {
  console.log(`IDENTICAL (${a.length} calls)`);
} else {
  console.log(diffs.join('\n'));
  process.exitCode = 1;
}
