'use strict';

const assert = require('node:assert/strict');

let tabBehavior = null;
try {
  tabBehavior = require('../src/tab-behavior.js');
} catch {
  // RED: 0.6.1 还没有可配置的新标签策略。
}

assert.ok(tabBehavior, 'tab behavior module must exist');

const source = { id: 12, index: 4, windowId: 8 };
const url = 'https://xiaoheihe.cn/app/bbs/link/123456';

assert.deepEqual(tabBehavior.createTabProperties({ url, openMode: 'foreground' }, source), {
  url,
  active: true,
  windowId: 8,
  index: 5,
  openerTabId: 12,
});

assert.deepEqual(tabBehavior.createTabProperties({ url, openMode: 'background' }, source), {
  url,
  active: false,
  windowId: 8,
  index: 5,
  openerTabId: 12,
});

assert.deepEqual(tabBehavior.createTabProperties({
  url,
  openMode: 'background',
  returnToSource: false,
}, source), {
  url,
  active: false,
  windowId: 8,
  index: 5,
});

assert.deepEqual(tabBehavior.createTabProperties({ url, openMode: 'background' }, null), {
  url,
  active: false,
});

assert.equal(tabBehavior.shouldRememberOrigin({ returnToSource: true }, source, { id: 31 }), true);
assert.equal(tabBehavior.shouldRememberOrigin({ returnToSource: false }, source, { id: 31 }), false);
assert.equal(tabBehavior.shouldRememberOrigin({ returnToSource: true }, null, { id: 31 }), false);

console.log('tab-behavior-tests: OK');
