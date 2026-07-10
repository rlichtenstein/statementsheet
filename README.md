# StatementSheet
Convert bank statement PDFs to Excel/CSV **entirely in your browser** — files never leave your machine. Every conversion is verified against the statement's own running balances. $19/batch, no subscription. Verified or free.

- `public/` — the entire product (static site). `parser.js` (extraction + verification), `xlsx.js` (dependency-free xlsx writer), `export.js`, `lines.js`, `app.js`.
- `api/verify.js` — the only server code: Stripe payment check. Never sees file data.
- `test/` — fixture generator (6 synthetic bank/card layouts + ground truth), parser tests, adversarial tests, export round-trip, local dev server.
- Zero npm dependencies (pdf.js vendored via `get_vendor.sh` is the only third-party code).

Run tests: `node test/test_parser.js && node test/test_adversarial.js && node test/test_export.js`
Local dev: `bash get_vendor.sh && MOCK_PAYMENTS=1 node test/server.js` → http://localhost:8788/?dev=1

Personal project of Richard Lichtenstein; not associated with Berkshire Partners.
