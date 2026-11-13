'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-feed-bridge.js'), 'utf8');
const sent = [];
const listeners = new Map();

class FakeXHR {
  addEventListener() {}
  open() {}
}

function makeLink(linkid, prefix) {
  return {
    linkid,
    imgs: [1, 2, 3, 4].map((number) => `https://cdn.example.com/${prefix}-${number}.jpg`),
    thumbs: [1, 2, 3].map((number) => `https://cdn.example.com/${prefix}-thumb-${number}.jpg`),
  };
}

const fullCollisionLink = makeLink(186626640, 'collision-full');
const partialCollisionLink = {
  linkid: 186626640,
  imgs: fullCollisionLink.imgs.slice(0, 2),
  thumbs: [1, 2, 3, 4].map((number) => `https://cdn.example.com/collision-thumb-${number}.jpg`),
};

const fixtures = new Map([
  ['/bbs/app/feeds', { result: { links: [makeLink(186626634, 'home')] } }],
  ['/bbs/app/api/general/search/v1/web', { result: { links: [makeLink(186626635, 'search')] } }],
  ['/bbs/app/topic/feeds', {
    result: { links: [makeLink(186626636, 'topic'), fullCollisionLink] },
  }],
  ['/bbs/app/profile/events', {
    result: {
      moments: [
        makeLink(186626637, 'profile-direct'),
        { link: makeLink(186626638, 'profile-wrapped') },
        { link: partialCollisionLink },
      ],
    },
  }],
  ['/bbs/app/profile/user/link/list_v2', {
    result: { post_links: [makeLink(186626639, 'profile-post')] },
  }],
]);

function makeResponse(payload) {
  return {
    clone() {
      return { json: async () => payload };
    },
  };
}

const windowObject = {
  location: {
    href: 'https://xiaoheihe.cn/app/bbs/home',
    origin: 'https://xiaoheihe.cn',
  },
  fetch: async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    return makeResponse(fixtures.get(url.pathname) || { result: { links: [makeLink(999999999, 'unknown')] } });
  },
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  postMessage(payload) {
    sent.push(payload);
  },
};

const context = vm.createContext({
  URL,
  Request,
  XMLHttpRequest: FakeXHR,
  window: windowObject,
});
vm.runInContext(source, context, { filename: 'page-feed-bridge.js' });

(async () => {
  for (const pathname of fixtures.keys()) {
    await windowObject.fetch(`https://api.xiaoheihe.cn${pathname}?page=1`);
  }
  await windowObject.fetch('https://api.xiaoheihe.cn/bbs/app/not-a-list-endpoint');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cachedIds = [...new Set(sent
    .filter((item) => item.type === 'feed-images')
    .map((item) => item.linkId))]
    .sort();
  assert.deepEqual(cachedIds, [
    '186626634',
    '186626635',
    '186626636',
    '186626637',
    '186626638',
    '186626639',
    '186626640',
  ]);
  assert.equal(cachedIds.includes('999999999'), false);

  const proactive = sent.find((item) => item.linkId === '186626638');
  assert.equal(proactive.urls.length, 4);
  assert.equal(proactive.totalCount, 4);

  sent.length = 0;
  const messageHandler = listeners.get('message');
  assert.equal(typeof messageHandler, 'function');
  messageHandler({
    source: windowObject,
    origin: 'https://xiaoheihe.cn',
    data: {
      source: 'xhh-community-content',
      type: 'request-feed-images',
      linkId: '186626638',
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].urls[3], 'https://cdn.example.com/profile-wrapped-4.jpg');

  sent.length = 0;
  messageHandler({
    source: windowObject,
    origin: 'https://xiaoheihe.cn',
    data: {
      source: 'xhh-community-content',
      type: 'request-feed-images',
      linkId: '186626640',
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].totalCount, 4);
  assert.equal(sent[0].urls[3], 'https://cdn.example.com/collision-full-4.jpg');

  console.log('feed-bridge-tests: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
