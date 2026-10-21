/* Run with: node server/preview.cjs */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const settings = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/auth-config.js'), 'utf8'), settings);
const entra = settings.window.FBAuthConfig.entra;
const demo = process.argv.includes('--demo') ? require('./demo.cjs')(root) : null;
const backend = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: root,
  env: { ...process.env, PORT: '8080', ENTRA_TENANT_ID: entra.tenantId, ENTRA_CLIENT_ID: entra.clientId, ...(demo ? demo.env : {}) },
  stdio: 'inherit'
});
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2'
};
const preview = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8931');
  if (url.pathname === '/__demo') {
    res.writeHead(302, { Location: '/admin.html', 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (demo && await demo.handle(req, res, url)) return;
  if (demo && url.pathname === '/assets/auth-config.js') {
    res.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' }); res.end(demo.config); return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const proxy = http.request({ hostname: '127.0.0.1', port: 8080, path: req.url, method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
    });
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Local API is starting. Refresh in a moment.' }));
    });
    req.pipe(proxy); return;
  }
  if (url.pathname === '/assets/server-config.js') {
    res.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' });
    res.end('window.FBServer = { apiBase: "/api", syncSeconds: 3 };'); return;
  }
  let requested;
  try { requested = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || relative.split(path.sep).some(part => part.startsWith('.')) || relative.startsWith('server/') || !mime[path.extname(file).toLowerCase()]) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(file, (error, content) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' });
    if (error) res.end('Not found');
    else if (demo && path.extname(file) === '.html') res.end(demo.html(content));
    else if (demo && url.pathname === '/assets/auth.js') res.end(demo.auth(content));
    else res.end(content);
  });
});
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  backend.kill();
  preview.close();
  if (preview.closeAllConnections) preview.closeAllConnections();
  // Bound shutdown even when a browser or proxy keeps a connection open.
  setTimeout(() => {
    backend.kill('SIGKILL');
    process.exit(0);
  }, 2000).unref();
};
preview.on('error', error => { console.error(error.message); backend.kill(); process.exitCode = 1; });
backend.on('error', error => { console.error(error.message); preview.close(); process.exitCode = 1; });
backend.on('exit', code => { preview.close(); process.exitCode = code || 0; });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
preview.listen(8931, '127.0.0.1', () => console.log('Website preview: http://localhost:8931/' + 'index.html'));
