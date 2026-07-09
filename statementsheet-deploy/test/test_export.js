'use strict';
const fs = require('fs'), path = require('path');
const P = require('../public/parser.js'), LB = require('../public/lines.js'), E = require('../public/export.js');
const FIX = path.join(__dirname, 'fixtures');
const itemsAll = JSON.parse(fs.readFileSync(path.join(FIX, 'extracted_items.json')));
const results = Object.keys(itemsAll).map(f => ({
  fileName: f.replace('.pdf', ''),
  parsed: P.parse(itemsAll[f].map(it => LB.reconstructLines(it)), { kind: /card/.test(f) ? 'card' : undefined }),
}));
fs.writeFileSync(path.join(FIX, 'out.xlsx'), Buffer.from(E.buildXlsx(results)));
fs.writeFileSync(path.join(FIX, 'out.csv'), E.buildCsv(results));
const total = results.reduce((a, r) => a + r.parsed.transactions.length, 0);
console.log('wrote out.xlsx + out.csv,', total, 'transactions,', 'all verified:', results.every(r => r.parsed.verified));
