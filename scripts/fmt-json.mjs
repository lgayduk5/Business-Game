// Compact-but-readable JSON: anything that fits on one line stays on one line.
export function fmt(v, indent = '', width = 150) {
  const flat = JSON.stringify(v, null, 1)?.replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  if (flat === undefined) return 'null';
  if (typeof v !== 'object' || v === null || flat.length + indent.length <= width) return flat;
  const ni = indent + '  ';
  if (Array.isArray(v)) return '[\n' + v.map((x) => ni + fmt(x, ni, width)).join(',\n') + '\n' + indent + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => ni + JSON.stringify(k) + ': ' + fmt(x, ni, width)).join(',\n') + '\n' + indent + '}';
}

// CLI: node scripts/fmt-json.mjs data/events/*.json  → rewrites files in place.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const f of process.argv.slice(2)) {
    writeFileSync(f, fmt(JSON.parse(readFileSync(f, 'utf8'))) + '\n');
    console.log('formatted', f);
  }
}
