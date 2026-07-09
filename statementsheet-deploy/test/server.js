'use strict';
// Local dev/test server: serves public/ and mounts api/*.js Vercel-style handlers.
const http = require('http'), fs = require('fs'), path = require('path');
const verify = require('../api/verify.js');
const PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/verify') return verify(req, res);
  let p = path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream');
  res.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  fs.createReadStream(p).pipe(res);
});
server.listen(process.env.PORT || 8788, () => console.log('listening on', server.address().port));
