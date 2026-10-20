const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');

test('bags are private to accounts, readable by admins and durable across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frisbeing-bags-test-'));
  const dataFile = path.join(dir, 'data.json');
  const users = [
    { id: 'member', email: 'member@tsinglan.org', name: 'Test Member' },
    { id: 'other', email: 'other@tsinglan.org', name: 'Other Member' },
    { id: 'admin', email: 'justin.he_27@tsinglan.org', name: 'Test Admin' },
    { id: 'leader', email: 'harry.xu_27@tsinglan.org', name: 'Test Leader' }
  ];
  const sessions = Object.fromEntries(users.map(user => [crypto.createHash('sha256').update('test-' + user.id).digest('hex'),
    { userId: user.id, until: Date.now() + 86400000 }]));
  fs.writeFileSync(dataFile, JSON.stringify({ version: 1, roster: [], users, sessions }));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let child;
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, '../server/server.js')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('listening on')) resolve(); });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('exit', code => reject(new Error(`API exited ${code}: ${output}`)));
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
  async function api(method, route, user, body, expected = 200) {
    const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer test-' + user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  try {
    await start();
    await api('GET', '/me/gear-bag', null, undefined, 401);
    await api('PUT', '/me/gear-bag', null, { products: {} }, 401);
    await api('GET', '/gear-bags', null, undefined, 401);
    await api('GET', '/gear-bags', 'member', undefined, 403);
    assert.equal((await api('GET', '/me/gear-bag', 'member')).updatedAt, null);
    const product = (await api('POST', '/gear-products', 'admin', { name: 'Club Shirt', price: 19.95 }, 201)).product;
    const products = { 'club-frisbee': 2, [product.id]: 3 };
    const saved = await api('PUT', '/me/gear-bag', 'member', { products, userId: 'other', total: 0 });
    assert.equal(saved.itemCount, 5);
    assert.equal(saved.total, 159.85);
    assert.equal(saved.items.find(item => item.productId === product.id).lineTotal, 59.85);
    assert.deepEqual((await api('GET', '/me/gear-bag', 'other')).products, {}, 'caller cannot assign a bag to another user');
    assert.equal((await api('GET', '/me/gear-bag?userId=member', 'other')).items.length, 0);
    await api('GET', '/me/gear-bag/member', 'other', undefined, 404);
    for (const bad of [null, [], { 'club-frisbee': 0 }, { 'club-frisbee': -1 }, { 'club-frisbee': 100 },
      { 'club-frisbee': 1.5 }, { 'club-frisbee': '2' }, { missing: 1 }, { constructor: 1 }]) {
      await api('PUT', '/me/gear-bag', 'member', { products: bad }, 400);
    }
    for (const role of ['admin', 'leader']) {
      const overview = await api('GET', '/gear-bags', role);
      assert.equal(overview.bags.length, 4);
      const member = overview.bags.find(bag => bag.userId === 'member');
      assert.equal(member.name, 'Test Member');
      assert.equal(member.total, 159.85);
      assert.deepEqual(member.products, products);
      assert.equal(overview.bags.find(bag => bag.userId === 'other').itemCount, 0);
      assert.ok(!JSON.stringify(overview).includes('test-member'), 'session tokens are never exposed');
    }
    await stop();
    await start();
    assert.deepEqual((await api('GET', '/me/gear-bag', 'member')).products, products);
    await api('PUT', '/gear-products/' + product.id, 'admin', { name: 'Club Shirt', price: 20.05, isPreorder: true });
    await api('PUT', '/me/gear-bag', 'other', { products: { [product.id]: 1 } }, 400);
    await api('PUT', '/me/gear-bag', 'member', { products: { 'club-frisbee': 2, [product.id]: 4 } }, 400);
    await api('PUT', '/me/gear-bag', 'member', { products: { 'club-frisbee': 2, [product.id]: 2 } });
    assert.equal((await api('GET', '/me/gear-bag', 'member')).total, 140.1, 'current catalog prices are used');
    await api('DELETE', '/gear-products/' + product.id, 'admin');
    assert.deepEqual((await api('GET', '/me/gear-bag', 'member')).products, { 'club-frisbee': 2 });
    await api('PUT', '/me/gear-bag', 'member', { products: {} });
    const empty = (await api('GET', '/gear-bags', 'admin')).bags.find(bag => bag.userId === 'member');
    assert.equal(empty.itemCount, 0);
    assert.equal(empty.total, 0);
    assert.ok(empty.updatedAt);
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
