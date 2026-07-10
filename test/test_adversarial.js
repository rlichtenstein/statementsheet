'use strict';
// A converter that can't detect its own failures is last year's coloring book.
const fs = require('fs'), path = require('path');
const P = require('../public/parser.js');
const LB = require('../public/lines.js');
const FIX = path.join(__dirname, 'fixtures');
const itemsAll = JSON.parse(fs.readFileSync(path.join(FIX, 'extracted_items.json')));
const pagesOf = f => itemsAll[f].map(it => LB.reconstructLines(it));

let pass = 0, fail = 0;
function expect(name, cond) { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); }

// 1. Drop a middle transaction row (summary untouched) -> must not verify
{
  const pages = pagesOf('stmt_b_checking_sections.pdf').map(p => p.slice());
  const idx = pages[0].findIndex(l => /^04\/07/.test(l));
  pages[0].splice(idx, 1);
  const res = P.parse(pages, {});
  expect('dropped row breaks verification', res.verified === false);
}
// 2. Corrupt one amount by a cent -> must not verify
{
  const pages = pagesOf('stmt_b_checking_sections.pdf').map(p => p.slice());
  const idx = pages[0].findIndex(l => /1,755\.60/.test(l));
  pages[0][idx] = pages[0][idx].replace('1,755.60', '1,755.61');
  const res = P.parse(pages, {});
  expect('penny corruption breaks verification', res.verified === false);
}
// 3. Balance-column statement: drop a row -> chain absorbs it, but printed-amount cross-check must catch it
{
  const pages = pagesOf('stmt_a_checking_balancecol.pdf').map(p => p.slice());
  const idx = pages[0].findIndex(l => /^04\/02 STARBUCKS/.test(l));
  pages[0].splice(idx, 1);
  const res = P.parse(pages, {});
  expect('dropped row in balance-col statement flagged', res.verified === false);
}
// 4. Empty text (scanned PDF) -> graceful, informative
{
  const res = P.parse([[]], {});
  expect('scanned/empty PDF handled gracefully', res.verified === false && res.issues.length > 0 && res.transactions.length === 0);
}
// 5. Random non-statement document -> no false positives
{
  const res = P.parse([['Quarterly Board Update', 'Revenue grew 4.5% in April', 'EBITDA margin 22.1%']], {});
  expect('non-statement produces no verified output', res.verified === false);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
