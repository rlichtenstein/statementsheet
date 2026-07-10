'use strict';
// StatementSheet core parser. Runs entirely in the browser (also testable in Node).
// Input: array of pages, each an array of text lines (strings).
// Output: { transactions, opening, closing, verified, issues, meta }
// Design principle: NEVER silently guess. Every result is checked against the
// statement's own running balance / summary totals. verified=true means the
// numbers tie to the penny.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StatementParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DATE_RES = [
    { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/, fmt: 'mdy' },
    { re: /^(\d{1,2})\/(\d{1,2})\b(?!\/)/, fmt: 'md' },
    { re: /^(\d{4})-(\d{2})-(\d{2})\b/, fmt: 'ymd' },
    { re: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?/i, fmt: 'mony' },
    { re: /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{4})?/i, fmt: 'dmon' },
  ];
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  // money token: optional -, optional $, digits with , thousands, .2 decimals, optional () for negative, optional trailing -
  const MONEY_RE = /\(?-?\s?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:\s?CR)?/g;

  function parseMoney(tok) {
    let neg = false;
    let t = tok.trim();
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); }
    if (/CR$/i.test(t)) { neg = true; t = t.replace(/CR$/i, ''); } // credit on a credit card statement
    t = t.replace(/[$,\s]/g, '');
    if (/^-/.test(t)) { neg = true; t = t.slice(1); }
    const v = Math.round(parseFloat(t) * 100);
    if (!isFinite(v)) return null;
    return neg ? -v : v; // integer cents
  }

  function fmtCents(c) {
    const sign = c < 0 ? '-' : '';
    const a = Math.abs(c);
    return sign + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
  }

  function parseDate(line, year) {
    for (const { re, fmt } of DATE_RES) {
      const m = line.match(re);
      if (!m) continue;
      let y, mo, d;
      if (fmt === 'mdy') { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
      else if (fmt === 'md') { mo = +m[1]; d = +m[2]; y = year || null; }
      else if (fmt === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if (fmt === 'mony') { mo = MONTHS[m[1].slice(0,3).toLowerCase()]; d = +m[2]; y = m[3] ? +m[3] : year || null; }
      else if (fmt === 'dmon') { d = +m[1]; mo = MONTHS[m[2].slice(0,3).toLowerCase()]; y = m[3] ? +m[3] : year || null; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      return { y, mo, d, matched: m[0] };
    }
    return null;
  }

  function isoDate(dt) {
    if (!dt) return '';
    const y = dt.y || '????';
    return `${y}-${String(dt.mo).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
  }

  // Find summary balances via keywords.
  const OPEN_KEYS = /(beginning|opening|previous|prior)\s+(balance|bal)/i;
  const CLOSE_KEYS = /(ending|closing|new)\s+(balance|bal)/i;

  function moneyAfter(line, keyRe) {
    const km = line.match(keyRe);
    if (!km) return null;
    const from = km.index + km[0].length;
    for (const m of line.matchAll(new RegExp(MONEY_RE.source, 'g'))) {
      if (m.index >= from) return parseMoney(m[0]);
    }
    return null;
  }

  function findSummary(allLines) {
    let opening = null, closing = null;
    for (const line of allLines) {
      if (opening === null) { const v = moneyAfter(line, OPEN_KEYS); if (v !== null) opening = v; }
      if (closing === null) { const v = moneyAfter(line, CLOSE_KEYS); if (v !== null) closing = v; }
    }
    return { opening, closing };
  }

  // Year hint for statements that print transaction dates without a year.
  // Only trust years that appear inside date-shaped text (04/01/2026, "June 3, 2026",
  // 2026-04-01); frequency-vote across the RAW page text (headers included, since the
  // statement period line often repeats on every page and gets header-stripped).
  // Bare 4-digit numbers are a last resort and never when preceded by CHECK/REF/ACCT/#
  // (check numbers like 2007 look exactly like years).
  function findYearHint(rawLines) {
    const votes = new Map();
    const add = (y, w) => { y = +y; if (y >= 1990 && y <= 2099) votes.set(y, (votes.get(y) || 0) + w); };
    const DATE_CTX = [
      /\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/g,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(20\d{2})\b/gi,
      /\b(20\d{2})-\d{2}-\d{2}\b/g,
    ];
    for (const line of rawLines) for (const re of DATE_CTX) for (const m of line.matchAll(re)) add(m[1], 10);
    if (!votes.size) {
      for (const line of rawLines) {
        for (const m of line.matchAll(/(.{0,12}?)\b(19\d{2}|20\d{2})\b/g)) {
          if (/(?:check|ref|acct|account|card|#)\s*#?\s*$/i.test(m[1])) continue;
          add(m[2], 1);
        }
      }
    }
    let best = null, bestN = 0;
    for (const [y, n] of votes) if (n > bestN || (n === bestN && y > best)) { best = y; bestN = n; }
    return best;
  }

  // Remove lines that repeat on most pages (headers/footers).
  function stripRepeats(pages) {
    if (pages.length < 2) return pages;
    const counts = new Map();
    for (const page of pages) {
      const seen = new Set();
      for (const l of page) {
        const key = l.replace(/\d/g, '#').trim();
        if (key.length < 4 || seen.has(key)) continue;
        seen.add(key);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
    return pages.map(page => page.filter(l => {
      const key = l.replace(/\d/g, '#').trim();
      const c = counts.get(key) || 0;
      // keep summary lines even if repeated
      if (OPEN_KEYS.test(l) || CLOSE_KEYS.test(l)) return true;
      // never strip transaction-shaped lines (leading date + money token, with
      // optional card-last-4 prefix): recurring merchants produce identical
      // digit-masks across pages
      const b = l.replace(/^\d{4}\s+(?=\d{1,2}\/\d{1,2}\b)/, '');
      if (parseDate(b, null) && (b.match(MONEY_RE) || []).length) return true;
      return c < threshold;
    }));
  }

  function classifySection(line) {
    if (/deposits|credits|additions|payments\s+and\s+other\s+credits|^payments\s*$/i.test(line)) return 'credit';
    if (/withdrawals|debits|subtractions|purchases|charges|payments\s+and\s+other\s+debits|checks|^fees\s*$|interest\s+charged/i.test(line)) return 'debit';
    return null;
  }

  function parse(pages, opts) {
    opts = opts || {};
    const issues = [];
    const cleanPages = stripRepeats(pages);
    const allLines = [].concat(...cleanPages);
    const { opening, closing } = findSummary(allLines);
    const yearHint = findYearHint([].concat(...pages));

    // Pass 1: collect candidate transaction rows
    const rows = [];
    let section = null;
    let last = null;
    for (const raw of allLines) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) { last = null; continue; }
      const sec = classifySection(line);
      // Card layouts often prefix rows with the card's last-4: "1234 06/01 06/02 ..."
      const cardPref = line.match(/^\d{4}\s+(?=\d{1,2}\/\d{1,2}\b)/);
      const body = cardPref ? line.slice(cardPref[0].length) : line;
      const dt = parseDate(body, yearHint);
      if (!dt) {
        if (sec) { section = sec; last = null; continue; }
        // continuation of previous description?
        const moneysHere = line.match(MONEY_RE) || [];
        if (last && !moneysHere.length && line.length < 90 && !/page \d/i.test(line)) {
          last.desc += ' ' + line;
        }
        continue;
      }
      // Skip summary rows that happen to start with a date
      if (OPEN_KEYS.test(line) || CLOSE_KEYS.test(line)) continue;
      let rest = body.slice(dt.matched.length).trim();
      // Consume a posting date that immediately follows the transaction date
      // ("06/01 06/02 DESC..." -> date=06/01, desc starts at DESC).
      const dt2 = parseDate(rest, yearHint);
      if (dt2 && dt2.matched.includes('/') && rest.charAt(dt2.matched.length) === ' ') rest = rest.slice(dt2.matched.length).trim();
      const moneyToks = rest.match(MONEY_RE) || [];
      if (!moneyToks.length) { last = null; continue; }
      const moneys = moneyToks.map(parseMoney);
      // description = rest minus money tokens (strip from the right)
      let desc = rest;
      for (let i = moneyToks.length - 1; i >= 0; i--) {
        const idx = desc.lastIndexOf(moneyToks[i]);
        if (idx >= 0) desc = desc.slice(0, idx) + desc.slice(idx + moneyToks[i].length);
      }
      desc = desc.replace(/\s+/g, ' ').trim();
      const row = { date: dt, desc, moneys, section, raw: line };
      rows.push(row);
      last = row;
    }

    if (!rows.length) {
      return { transactions: [], opening, closing, verified: false, issues: ['No transactions found. This may be a scanned/image PDF (not yet supported) or an unrecognized layout.'], meta: { yearHint } };
    }

    // Determine column shape: does each row carry a trailing running balance?
    const twoPlus = rows.filter(r => r.moneys.length >= 2).length;
    const hasBalanceCol = twoPlus >= Math.max(2, Math.floor(rows.length * 0.7));

    let txs = [];
    let chainConflicts = 0;
    if (hasBalanceCol && opening !== null) {
      // amount = second-to-last money, balance = last. Sign solved from balance chain.
      let prev = opening;
      for (const r of rows) {
        const bal = r.moneys[r.moneys.length - 1];
        const amtTok = r.moneys.length >= 2 ? r.moneys[r.moneys.length - 2] : null;
        let amount = bal - prev; // ground truth from the chain
        if (amtTok !== null && Math.abs(amtTok) !== Math.abs(amount)) {
          issues.push(`Row "${r.raw.slice(0, 60)}...": printed amount ${fmtCents(amtTok)} disagrees with balance change ${fmtCents(amount)}.`);
          chainConflicts++;
        }
        txs.push({ date: isoDate(r.date), description: r.desc, amount, balance: bal });
        prev = bal;
      }
    } else {
      // No balance column (typical credit card): use sign cues + section context
      for (const r of rows) {
        const amtRaw = r.moneys[r.moneys.length - 1];
        let amount = amtRaw;
        if (r.section === 'debit' && amount > 0) amount = -amount;
        if (r.section === 'credit' && amount < 0) amount = Math.abs(amount);
        if (!r.section && opts.kind === 'card' && amount > 0) amount = -amount;
        txs.push({ date: isoDate(r.date), description: r.desc, amount, balance: null });
      }
    }

    // Verification
    let verified = false;
    const sum = txs.reduce((a, t) => a + t.amount, 0);
    let accountType = 'bank';
    if (opening !== null && closing !== null) {
      if (opening + sum === closing) verified = true;
      else if (opening - sum === closing) {
        // Credit card: statement balance is "amount owed" (purchases increase it).
        // Output stays in cash convention (purchases negative, payments positive).
        verified = true; accountType = 'card';
      }
      else issues.push(`Balance check failed: opening ${fmtCents(opening)} + transactions ${fmtCents(sum)} = ${fmtCents(opening + sum)}, but statement says closing ${fmtCents(closing)}.`);
      if (verified && chainConflicts > 0) {
        verified = false;
        issues.unshift(`${chainConflicts} row(s) disagree with the running balance chain - possible missed or merged rows.`);
      }
    } else if (hasBalanceCol && txs.length && closing !== null) {
      verified = txs[txs.length - 1].balance === closing;
      if (!verified) issues.push('Last running balance does not match stated closing balance.');
    } else {
      issues.push('Statement summary (opening/closing balance) not found; totals could not be independently verified.');
    }

    return {
      transactions: txs,
      opening, closing, verified, issues,
      meta: { yearHint, hasBalanceCol, count: txs.length, netCents: sum, accountType },
    };
  }

  return { parse, parseMoney, fmtCents, _internals: { parseDate, findSummary, stripRepeats } };
});
