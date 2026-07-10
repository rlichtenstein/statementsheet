'use strict';
const fs = require('fs'), path = require('path');
const P = require('../public/parser.js');
const LB = require('../public/lines.js');
const FIX = path.join(__dirname, 'fixtures');
const itemsAll = JSON.parse(fs.readFileSync(path.join(FIX, 'extracted_items.json')));
const truth = JSON.parse(fs.readFileSync(path.join(FIX, 'ground_truth.json')));

let pass = 0, fail = 0;
for (const t of truth) {
  const pages = itemsAll[t.file].map(items => LB.reconstructLines(items));
  const res = P.parse(pages, { kind: t.kind });
  const gtSum = t.txs.reduce((a, x) => a + x.amount, 0);
  const gotSum = res.transactions.reduce((a, x) => a + x.amount, 0);
  const checks = {
    verified: res.verified === true,
    count: res.transactions.length === t.txs.length,
    opening: res.opening === t.opening,
    closing: res.closing === t.closing,
    net: gotSum === gtSum,
    dates: res.transactions.length === t.txs.length &&
      JSON.stringify(res.transactions.map(x => x.date).sort()) === JSON.stringify(t.txs.map(x => x.date).sort()),
  };
  const ok = Object.values(checks).every(Boolean);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t.file}  count ${res.transactions.length}/${t.txs.length}  verified=${res.verified}  net ${P.fmtCents(gotSum)} vs ${P.fmtCents(gtSum)}`);
  if (!ok) {
    console.log('  checks:', JSON.stringify(checks));
    console.log('  issues:', res.issues.slice(0, 3));
    console.log('  sample lines:', JSON.stringify(pages[0].slice(3, 8)));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
