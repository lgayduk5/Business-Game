// Edit a data file with a small JavaScript transform and write it back in the house JSON style.
//   node scripts/edit-json.mjs data/industries.json 'd => { d[0].tier = "gentle"; }'
import { readFileSync, writeFileSync } from 'node:fs';
import { fmt } from './fmt-json.mjs';

const [file, code] = process.argv.slice(2);
if (!file || !code) {
  console.error('usage: node scripts/edit-json.mjs <file.json> "<(data) => { ... }>"');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const out = (0, eval)(code)(data);
writeFileSync(file, fmt(out === undefined ? data : out) + '\n');
console.log('edited', file);
