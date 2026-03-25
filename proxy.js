#!/usr/bin/env node
// proxy.js — optional local CORS proxy for httpclient
//
// Usage:
//   node proxy.js              # port 8080 (default)
//   PORT=9000 node proxy.js    # custom port
//
// In httpclient: enable "Proxy" tab, set URL to http://localhost:8080
// Requests are forwarded as: GET http://localhost:8080/https://api.example.com/foo

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age':       '86400',
};

const server = http.createServer((req, res) => {

  // Strip leading slash to get the target URL
  const rawTarget = decodeURIComponent(req.url.slice(1));

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Validate target URL
  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Bad protocol');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain', ...CORS_HEADERS });
    res.end(`Bad target URL: "${rawTarget}"\n\nUsage: http://localhost:${PORT}/https://api.example.com/path`);
    return;
  }

  console.log(`→ ${req.method} ${targetUrl.href}`);

  // Forward headers (strip proxy-specific ones)
  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['origin'];
  delete forwardHeaders['referer'];
  forwardHeaders['host'] = targetUrl.host;

  const lib = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(
    {
      method:   req.method,
      hostname: targetUrl.hostname,
      port:     targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path:     targetUrl.pathname + targetUrl.search,
      headers:  forwardHeaders,
    },
    (proxyRes) => {
      const resHeaders = { ...proxyRes.headers, ...CORS_HEADERS };
      // Remove hop-by-hop headers
      ['transfer-encoding', 'connection', 'keep-alive'].forEach(h => delete resHeaders[h]);
      res.writeHead(proxyRes.statusCode, resHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain', ...CORS_HEADERS });
    }
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nhttpclient CORS proxy running`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`Usage in httpclient: enable Proxy tab, set URL to http://localhost:${PORT}`);
  console.log(`Requests: http://localhost:${PORT}/https://api.example.com/path\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=9000 node proxy.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
