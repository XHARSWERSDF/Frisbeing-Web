const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('published hosts cannot create or activate local preview modes, even with stored preview state', () => {
  const script = fs.readFileSync(path.join(__dirname, '../assets/preview-mode.js'), 'utf8');
  for (const hostname of ['frisbeing.com', 'www.frisbeing.com', 'release.example.com']) {
    const stored = new Map([['frisbeing.ui-preview.v1', '1'], ['frisbeing.ui-preview.role', 'leader']]);
    const context = {
      location: { protocol: 'https:', hostname },
      localStorage: { removeItem: key => stored.delete(key), getItem: key => stored.get(key) },
      document: { getElementById() { assert.fail('Production must not create preview controls'); } }
    };
    vm.runInNewContext(script, context);
    assert.equal(context.FBPreview, undefined);
    assert.equal(stored.size, 0);
  }
});
