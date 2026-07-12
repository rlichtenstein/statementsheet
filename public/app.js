'use strict';
/* StatementSheet app logic. All file processing happens in THIS browser tab.
   Network calls: NONE during conversion. Stripe checkout + /api/verify only at payment. */
(function () {
  const $ = id => document.getElementById(id);
  const state = { results: [], paid: false };
  const MAX_FILES = 12;
  const PAYMENT_LINK = window.SS_CONFIG.paymentLink; // set in config.js

  // ---- pdf.js glue (the only browser-only code path; keep tiny) ----
  async function extractPages(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
      pages.push(LineBuilder.reconstructLines(items));
    }
    return pages;
  }

  async function handleFiles(fileList) {
    const room = MAX_FILES - state.results.length;
    if (room <= 0) {
      $('batchnote').textContent = 'This batch is full (12 statements). Click "Start over" to begin a new batch.';
      $('batchnote').hidden = false;
      $('results').hidden = false;
      return;
    }
    const dropped = [...fileList].filter(f => /\.pdf$/i.test(f.name));
    const files = dropped.slice(0, room);
    $('batchnote').hidden = true;
    if (dropped.length > room) {
      $('batchnote').textContent = `A batch is up to 12 statements — the first ${files.length} of ${dropped.length} files were added. Start a new batch for the rest.`;
      $('batchnote').hidden = false;
    }
    if (!files.length) return;
    $('results').hidden = false;
    $('dropzone').classList.add('busy');
    for (const f of files) {
      const row = addFileRow(f.name);
      try {
        const pages = await extractPages(await f.arrayBuffer());
        const textDensity = pages.reduce((a, p) => a + p.length, 0);
        const parsed = StatementParser.parse(pages, {});
        if (!parsed.transactions.length && textDensity < 5) {
          parsed.issues = ['This looks like a scanned (image-only) PDF. StatementSheet currently supports digital PDFs downloaded from your bank portal.'];
        }
        state.results.push({ fileName: f.name, parsed });
        renderFileRow(row, parsed);
      } catch (e) {
        renderFileRow(row, { transactions: [], verified: false, issues: ['Could not read this PDF: ' + e.message], opening: null, closing: null, meta: {} });
      }
    }
    $('dropzone').classList.remove('busy');
    renderPreview();
    persist();
  }

  function addFileRow(name) {
    const div = document.createElement('div');
    div.className = 'filerow';
    div.innerHTML = `<span class="fname"></span><span class="badge">processing…</span><span class="detail"></span>`;
    div.querySelector('.fname').textContent = name;
    $('filelist').appendChild(div);
    return div;
  }
  function renderFileRow(div, parsed) {
    const badge = div.querySelector('.badge'), detail = div.querySelector('.detail');
    if (parsed.verified) {
      badge.textContent = '✓ Balances verified';
      badge.className = 'badge ok';
      detail.textContent = `${parsed.transactions.length} transactions · ${parsed.meta.accountType === 'card' ? 'credit card' : 'bank account'}`;
    } else {
      badge.textContent = parsed.transactions.length ? '⚠ Needs review' : '✗ Not converted';
      badge.className = 'badge ' + (parsed.transactions.length ? 'warn' : 'err');
      detail.textContent = parsed.issues[0] || '';
    }
  }

  function renderPreview() {
    const all = [];
    for (const r of state.results) for (const t of r.parsed.transactions) all.push({ ...t, file: r.fileName });
    $('txcount').textContent = all.length;
    const okCount = state.results.filter(r => r.parsed.verified).length;
    $('verifiedcount').textContent = `${okCount} of ${state.results.length}`;
    const tbody = $('previewtable').querySelector('tbody');
    tbody.innerHTML = '';
    for (const t of all.slice(0, 8)) {
      const tr = document.createElement('tr');
      const cells = [t.date, t.description, (t.amount / 100).toFixed(2), t.balance == null ? '' : (t.balance / 100).toFixed(2)];
      for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    $('previewmore').textContent = all.length > 8 ? `…and ${all.length - 8} more rows` : '';
    $('paywall').hidden = state.paid;
    $('downloads').hidden = !state.paid;
  }

  // ---- persistence across the Stripe redirect (stays on this device) ----
  function persist() {
    try { sessionStorage.setItem('ss_results', JSON.stringify(state.results)); } catch (e) {}
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem('ss_results');
      if (raw) { state.results = JSON.parse(raw); if (state.results.length) { $('results').hidden = false; for (const r of state.results) renderFileRow(addFileRow(r.fileName), r.parsed); } }
      state.paid = sessionStorage.getItem('ss_paid') === '1';
    } catch (e) {}
  }

  // ---- attribution (sale tagging only; no tracking requests) ----
  // First-touch source: ?utm_source=... on inbound links, else referrer hostname.
  // Passed to Stripe as client_reference_id so each sale shows its channel.
  function captureSource() {
    try {
      if (sessionStorage.getItem('ss_src')) return;
      const utm = new URLSearchParams(location.search).get('utm_source');
      let src = utm || (document.referrer ? new URL(document.referrer).hostname : '');
      src = (src || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
      if (src) sessionStorage.setItem('ss_src', src);
    } catch (e) {}
  }

  // ---- payment ----
  async function checkPayment() {
    const sid = new URLSearchParams(location.search).get('session_id');
    if (!sid) return;
    try {
      const r = await fetch('/api/verify?session_id=' + encodeURIComponent(sid));
      const j = await r.json();
      if (j.paid) { state.paid = true; sessionStorage.setItem('ss_paid', '1'); }
    } catch (e) {}
  }

  function download(name, data, mime) {
    const blob = new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---- wire up ----
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof pdfjsLib !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    captureSource();
    restore();
    await checkPayment();
    renderPreview();
    const dz = $('dropzone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('hover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('hover'); handleFiles(e.dataTransfer.files); });
    dz.addEventListener('click', () => $('fileinput').click());
    $('fileinput').addEventListener('change', e => handleFiles(e.target.files));
    $('paybtn').addEventListener('click', () => {
      persist();
      let src = null;
      try { src = sessionStorage.getItem('ss_src'); } catch (e) {}
      location.href = PAYMENT_LINK + (src ? '?client_reference_id=' + encodeURIComponent(src) : '');
    });
    $('dlxlsx').addEventListener('click', () => download('statements.xlsx', Exporter.buildXlsx(state.results), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    $('dlcsv').addEventListener('click', () => download('statements.csv', Exporter.buildCsv(state.results), 'text/csv'));
    $('clearbtn').addEventListener('click', () => {
      if (state.paid && state.results.length &&
          !confirm('Starting over clears this batch and its unlocked downloads. Continue?')) return;
      state.results = [];
      state.paid = false;
      try { sessionStorage.removeItem('ss_results'); sessionStorage.removeItem('ss_paid'); } catch (e) {}
      $('filelist').innerHTML = '';
      $('results').hidden = true;
      $('fileinput').value = '';
      $('batchnote').hidden = true;
      renderPreview();
    });

  });
})();
