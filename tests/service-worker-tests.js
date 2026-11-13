'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');
const serviceWorkerSource = fs.readFileSync(path.join(srcDir, 'service-worker.js'), 'utf8');
const createdTabs = [];
const updatedTabs = [];
const sessionValues = new Map();
let messageListener = null;
let removedListener = null;
let nextTabId = 90;
let localSettings = {
  enabled: true,
  openMode: 'background',
  returnToSource: false,
  imageViewer: true,
  multiImageCompletion: true,
  commentMode: 'popup',
};
let pendingLocalRead = null;
let delayLocalRead = false;

const chrome = {
  runtime: {
    onMessage: {
      addListener(listener) { messageListener = listener; },
    },
  },
  storage: {
    local: {
      get(key, callback) {
        const finish = () => callback({ [key]: localSettings });
        if (delayLocalRead) pendingLocalRead = finish;
        else finish();
      },
    },
    session: {
      async set(payload) {
        for (const [key, value] of Object.entries(payload)) sessionValues.set(key, value);
      },
      async get(key) {
        return sessionValues.has(key) ? { [key]: sessionValues.get(key) } : {};
      },
      async remove(key) {
        sessionValues.delete(key);
      },
    },
  },
  tabs: {
    async create(properties) {
      createdTabs.push(properties);
      return { id: nextTabId++, windowId: properties.windowId };
    },
    async get(tabId) {
      return { id: tabId, windowId: 8 };
    },
    async update(tabId, properties) {
      updatedTabs.push({ tabId, properties });
    },
    onRemoved: {
      addListener(listener) { removedListener = listener; },
    },
  },
};

const context = vm.createContext({ URL, chrome, console, globalThis: null });
context.globalThis = context;
context.importScripts = (...names) => {
  for (const name of names) {
    const source = fs.readFileSync(path.join(srcDir, name), 'utf8');
    vm.runInContext(source, context, { filename: name });
  }
};
vm.runInContext(serviceWorkerSource, context, { filename: 'service-worker.js' });

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  assert.equal(typeof messageListener, 'function');
  assert.equal(typeof removedListener, 'function');

  const sender = { tab: { id: 12, index: 4, windowId: 8 } };
  messageListener({
    type: 'open-post',
    url: 'https://xiaoheihe.cn/app/bbs/link/123456',
    openMode: 'foreground',
    returnToSource: true,
  }, sender);
  await flush();
  await flush();

  assert.deepEqual(JSON.parse(JSON.stringify(createdTabs[0])), {
    url: 'https://xiaoheihe.cn/app/bbs/link/123456',
    active: false,
    windowId: 8,
    index: 5,
  });
  assert.equal(sessionValues.size, 0);

  localSettings = {
    ...localSettings,
    openMode: 'foreground',
    returnToSource: true,
  };
  messageListener({
    type: 'open-post',
    url: 'https://xiaoheihe.cn/app/bbs/link/654321',
    openMode: 'background',
    returnToSource: false,
  }, sender);
  await flush();
  await flush();

  assert.equal(createdTabs[1].active, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sessionValues.get('xhh-post-origin:91'))),
    { sourceTabId: 12, windowId: 8 },
  );

  removedListener(91, { isWindowClosing: false, windowId: 8 });
  await flush();
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(updatedTabs)), [{
    tabId: 12,
    properties: { active: true },
  }]);
  assert.equal(sessionValues.size, 0);

  localSettings = { ...localSettings, openMode: 'native' };
  messageListener({
    type: 'open-post',
    url: 'https://xiaoheihe.cn/app/bbs/link/777777',
    openMode: 'foreground',
    returnToSource: true,
  }, sender);
  await flush();
  await flush();
  assert.equal(createdTabs.length, 2);

  localSettings = { ...localSettings, openMode: 'background' };
  delayLocalRead = true;
  messageListener({
    type: 'open-post',
    url: 'https://xiaoheihe.cn/app/bbs/link/888888',
  }, sender);
  await flush();
  assert.equal(createdTabs.length, 2);
  delayLocalRead = false;
  pendingLocalRead();
  await flush();
  await flush();
  assert.equal(createdTabs.length, 3);
  assert.equal(createdTabs[2].active, false);

  console.log('service-worker-tests: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
