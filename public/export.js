'use strict';
// Build xlsx / csv outputs from parse results. Portable: browser + Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./xlsx.js'));
  } else root.Exporter = factory(root.MiniXlsx);
})(typeof self !== 'undefined' ? self : this, function (MiniXlsx) {
  // opts: { dateFmt: 'iso' | 'mdy', split: false | true (separate Debit/Credit columns) }
  function hdr(opts) {
    return opts && opts.split
      ? ['Date', 'Description', 'Debit', 'Credit', 'Balance', 'Source File', 'Verified']
      : ['Date', 'Description', 'Amount', 'Balance', 'Source File', 'Verified'];
  }
  function fmtDate(iso, opts) {
    if (!opts || opts.dateFmt !== 'mdy' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4);
  }
  function toRows(results, opts) {
    // results: [{fileName, parsed}]
    const rows = [];
    for (const { fileName, parsed } of results) {
      for (const t of parsed.transactions) {
        const bal = t.balance == null ? null : t.balance / 100;
        const flag = parsed.verified ? 'Yes' : 'REVIEW';
        if (opts && opts.split) {
          rows.push([fmtDate(t.date, opts), t.description,
            t.amount < 0 ? -t.amount / 100 : null,
            t.amount >= 0 ? t.amount / 100 : null,
            bal, fileName, flag]);
        } else {
          rows.push([fmtDate(t.date, opts), t.description, t.amount / 100, bal, fileName, flag]);
        }
      }
    }
    return rows;
  }

  function buildXlsx(results, opts) {
    const dataRows = toRows(results, opts);
    const HDR = hdr(opts);
    const txSheet = {
      name: 'Transactions',
      colWidths: opts && opts.split ? [12, 52, 12, 12, 12, 28, 10] : [12, 52, 12, 12, 28, 10],
      rows: [
        HDR.map(h => ({ v: h, style: 1 })),
        ...dataRows.map(r => {
          const nAmountCols = (opts && opts.split) ? 2 : 1;
          const cells = [{ v: r[0] }, { v: r[1] }];
          for (let i = 2; i < 2 + nAmountCols + 1; i++) {           // amount col(s) + balance
            cells.push(r[i] == null ? null : { v: r[i], t: 'n', style: 2 });
          }
          cells.push({ v: r[2 + nAmountCols + 1] });                 // source file
          cells.push({ v: r[2 + nAmountCols + 2] });                 // verified
          return cells;
        }),
      ],
    };
    const sumRows = [['File', 'Type', 'Transactions', 'Opening', 'Closing', 'Net', 'Balance Check'].map(h => ({ v: h, style: 1 }))];
    for (const { fileName, parsed } of results) {
      sumRows.push([
        { v: fileName },
        { v: parsed.meta && parsed.meta.accountType === 'card' ? 'Credit card' : 'Bank account' },
        { v: parsed.transactions.length, t: 'n' },
        parsed.opening == null ? null : { v: parsed.opening / 100, t: 'n', style: 2 },
        parsed.closing == null ? null : { v: parsed.closing / 100, t: 'n', style: 2 },
        { v: parsed.meta.netCents / 100, t: 'n', style: 2 },
        { v: parsed.verified ? 'VERIFIED - ties to the penny' : 'NEEDS REVIEW: ' + (parsed.issues[0] || '') },
      ]);
    }
    return MiniXlsx.workbook([txSheet, { name: 'Summary', colWidths: [28, 12, 12, 12, 12, 12, 60], rows: sumRows }]);
  }

  function csvEsc(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCsv(results, opts) {
    const lines = [hdr(opts).join(',')];
    for (const r of toRows(results, opts)) lines.push(r.map(x => csvEsc(x == null ? '' : (typeof x === 'number' ? x.toFixed(2) : x))).join(','));
    return lines.join('\r\n');
  }
  return { buildXlsx, buildCsv };
});
