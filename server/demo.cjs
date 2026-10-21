/* Fixtures and local sign-in for preview.cjs --demo. Never used by server.js. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

module.exports = function createDemo(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frisbeing-demo-'));
  const roster = JSON.parse(fs.readFileSync(path.join(root, 'roster.json'), 'utf8'));
  const entries = [
    ['admin', 'Justin He', 'justin.he_27@tsinglan.org', 'Admin'],
    ['handle', 'Robert Niu', 'demo.handle@tsinglan.org', 'Player · Handle · T1'],
    ['cutter', 'Eva Song', 'demo.cutter@tsinglan.org', 'Player · Cutter · T1'],
    ['intermediate', 'Cloris Lin', 'demo.intermediate@tsinglan.org', 'Player · Cutter · T2'],
    ['beginner', 'Maxim Jiang', 'demo.beginner@tsinglan.org', 'Player · Cutter · T3'],
    ['newcomer', 'Demo Newcomer', 'demo.newcomer@tsinglan.org', 'Player · Unclassified']
  ];
  const accounts = entries.map(([id, name, email, label]) => ({ id, name, email, label }));
  const users = accounts.map(a => ({ id: a.id, name: a.name, email: a.email,
    member: roster.some(m => m.name === a.name) ? a.name : null,
    linkedByHand: true, createdAt: Date.now() }));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 1);
  const tomorrow = date.toISOString().slice(0, 10);
  const dataFile = path.join(dir, 'data.json');
  fs.writeFileSync(dataFile, JSON.stringify({ version: 1, roster, users, sessions: {}, gamesVersion: 1,
    rosterRevision: 'new-tier-2026-10-08', schedule: { weekdays: [], since: today, added: [today, tomorrow], removed: [] },
    games: {
      [today]: { rsvps: { admin: 'in', cutter: 'in', intermediate: 'in', beginner: 'in' }, draw: null },
      [tomorrow]: { rsvps: { cutter: 'in' }, draw: null }
    }, push: {} }, null, 2));
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = crypto.randomBytes(12).toString('hex');
  const tenant = 'local-demo-tenant', client = 'local-demo-client';
  const sign = account => {
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const message = encode({ alg: 'RS256', kid }) + '.' + encode({
      tid: tenant, aud: client, iss: 'https://login.microsoftonline.com/' + tenant + '/v2.0',
      preferred_username: account.email, name: account.name, exp: now + 300, nbf: now - 5
    });
    return message + '.' + crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url');
  };

  return {
    env: { DATA_FILE: dataFile, ENTRA_TENANT_ID: tenant, ENTRA_CLIENT_ID: client, ENTRA_JWKS_URL: 'http://127.0.0.1:8931/__demo/keys', HOST: '127.0.0.1' },
    async handle(req, res, url) {
      if (!url.pathname.startsWith('/__demo')) return false;
      res.setHeader('Cache-Control', 'no-store');
      if (url.pathname === '/__demo' && req.method === 'GET') {
        res.writeHead(302, { Location: '/admin.html' }); res.end(); return true;
      }
      if (url.pathname === '/__demo/keys' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }] })); return true;
      }
      if (url.pathname === '/__demo/login' && req.method === 'POST') {
        try {
          if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) throw Error('Open the local test page to sign in.');
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 1000) throw Error('Request too large'); }
          const account = accounts.find(a => a.id === JSON.parse(body).id);
          if (!account) throw Error('Choose a listed test account');
          const upstream = await fetch('http://127.0.0.1:8080/api/login/microsoft', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: sign(account) })
          });
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); res.end(await upstream.text());
        } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
        return true;
      }
      res.writeHead(404); res.end('Not found'); return true;
    },
    html(content) {
      return content.toString().replace('assets/auth.js"', 'assets/auth.js?demo=' + kid + '"')
        .replace('<script src="assets/pwa.js"></script>', '');

    },
    auth(content) { return content.toString().replace(/window\.localStorage/g, 'window.sessionStorage'); },
    config: 'window.FBAuthConfig={entra:{tenantId:"' + tenant + '",clientId:"' + client + '"},emailDomain:"tsinglan.org",sessionDays:1};'
  };
};
