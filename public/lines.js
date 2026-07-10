'use strict';
// Reconstruct visual text lines from positioned text items ({str, x, y}).
// Used identically in the browser (fed by pdf.js getTextContent items) and in
// tests (fed by pypdf-extracted items) so the tested path IS the shipped path.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LineBuilder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function reconstructLines(items, yTol) {
    yTol = yTol || 2.5;
    const rows = []; // {y, items:[]}
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      let row = null;
      for (const r of rows) if (Math.abs(r.y - it.y) <= yTol) { row = r; break; }
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
      row.y = (row.y * (row.items.length - 1) + it.y) / row.items.length; // running mean
    }
    rows.sort((a, b) => b.y - a.y); // top of page first (PDF y-axis points up)
    return rows.map(r =>
      r.items.sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ')
        .replace(/\s+/g, ' ').trim()
    ).filter(Boolean);
  }
  return { reconstructLines };
});
