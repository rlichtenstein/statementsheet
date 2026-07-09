'use strict';
// Build xlsx / csv outputs from parse results. Portable: browser + Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./xlsx.js'));
  } else root.Exporter = factory(root.MiniXlsx);
})(typeof self !== 'undefined' ? self : this, function (MiniXlsx) {
  const HDR = ['Date', 'Description', 'Amount', 'Balance', 'Source File', 'Verified'];

  function toRows(results) {
    // results: [{fileName, parsed}]
    const rows = [];
    for (const { fileName, parsed } of results) {
      for (const t of parsed.transactions) {
        rows.push([t.date, t.description, t.amount / 100, t.balance == null ? null : t.balance / 100, fileName, parsed.verified ? 'Yes' : 'REVIEW']);
      }
    }
    return rows;
  }

  function buildXlsx(results) {
    const dataRows = toRows(results);
    const txSheet = {
      name: 'Transactions',
      colWidths: [12, 52, 12, 12, 28, 10],
      rows: [
        HDR.map(h => ({ v: h, style: 1 })),
        ...dataRows.map(r => [
          { v: r[0] }, { v: r[1] },
          { v: r[2], t: 'n', style: 2 },
          r[3] == null ? null : { v: r[3], t: 'n', style: 2 },
          { v: r[4] }, { v: r[5] },
        ]),
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
  function buildCsv(results) {
    const lines = [HDR.join(',')];
    for (const r of toRows(results)) lines.push(r.map(x => csvEsc(x == null ? '' : (typeof x === 'number' ? x.toFixed(2) : x))).join(','));
    return lines.join('\r\n');
  }
  return { buildXlsx, buildCsv };
});
