'use strict';
// The ONLY server code in StatementSheet. Verifies a Stripe Checkout session is paid.
// Receives: a Stripe session id. Never receives: files, transactions, or any customer PII.
// Zero npm dependencies; uses Stripe's REST API directly.
const RATE = new Map(); // naive per-IP rate limit
module.exports = async (req, res) => {
  const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0];
    const now = Date.now();
    const hits = (RATE.get(ip) || []).filter(t => now - t < 60000);
    hits.push(now); RATE.set(ip, hits);
    if (hits.length > 30) return send(429, { error: 'rate_limited' });

    const url = new URL(req.url, 'http://x');
    const sid = url.searchParams.get('session_id') || '';
    if (!/^cs_[a-zA-Z0-9_]+$/.test(sid)) return send(400, { error: 'bad_session_id' });

    if (process.env.MOCK_PAYMENTS === '1') return send(200, { paid: sid.includes('paid') });

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), {
      headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
    });
    if (!r.ok) return send(402, { paid: false });
    const s = await r.json();
    return send(200, { paid: s.payment_status === 'paid' });
  } catch (e) {
    return send(500, { error: 'server_error' });
  }
};
