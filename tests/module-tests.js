'use strict';

const assert = require('node:assert/strict');
const decision = require('../src/decision.js');
const frameContent = require('../src/frame-content.js');
const native = require('../src/native-interactions.js');

assert.equal(decision.isPostUrl('https://xiaoheihe.cn/app/bbs/link/123456'), true);
assert.equal(decision.isPostUrl('https://xiaoheihe.cn/app/bbs/link/123456/?redirect_data=share'), true);
assert.equal(decision.isPostUrl('https://www.xiaoheihe.cn/app/bbs/link/123456'), true);
assert.equal(decision.isPostUrl('https://xiaoheihe.cn/app/bbs/home'), false);
assert.equal(decision.isPostUrl('https://example.com/app/bbs/link/123456'), false);
assert.equal(decision.isPostUrl('https://evil.xiaoheihe.cn/app/bbs/link/123456'), false);
assert.equal(decision.isPostUrl('http://xiaoheihe.cn/app/bbs/link/123456'), false);
assert.equal(decision.isPostUrl('https://xiaoheihe.cn/app/bbs/link/not-a-number'), false);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/bbs/home',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
}), true);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/user/profile/23340368',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: true,
}), false);

assert.equal(decision.isSupportedListPath('/app/bbs/home'), true);
assert.equal(decision.isSupportedListPath('/app/search/list'), true);
assert.equal(decision.isSupportedListPath('/app/search'), false);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/search/list',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
  isSearchPostCard: true,
}), true);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/search/list',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
  isSearchPostCard: false,
}), true);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/user/profile/23340368',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
}), true);

assert.equal(decision.shouldEnhancePost({
  pathname: '/app/topic/link/1',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
}), true);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/user/profile/23340368',
  href: 'https://xiaoheihe.cn/app/user/profile/42',
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
}), false);

assert.equal(decision.shouldOpenPost({
  pathname: '/app/bbs/home',
  href: 'https://xiaoheihe.cn/app/bbs/link/123456',
  button: 0,
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  excludedTarget: false,
}), false);

assert.equal(native.getPostId('https://xiaoheihe.cn/app/bbs/link/987'), '987');
assert.equal(native.getPostId('https://www.xiaoheihe.cn/app/bbs/link/654/?from=profile'), '654');
assert.equal(native.getPostId('https://xiaoheihe.cn/app/bbs/home'), null);
assert.equal(native.isSiteOrigin('https://xiaoheihe.cn'), true);
assert.equal(native.isSiteOrigin('https://www.xiaoheihe.cn'), true);
assert.equal(native.isSiteOrigin('https://evil.xiaoheihe.cn'), false);

const commentsUrl = native.makeFrameUrl('https://xiaoheihe.cn/app/bbs/link/987', 'comments');
assert.equal(commentsUrl, 'https://xiaoheihe.cn/app/bbs/link/987#xhh-native-comments');
assert.equal(
  native.makeFrameUrl('https://www.xiaoheihe.cn/app/bbs/link/654/?from=profile', 'comments'),
  'https://www.xiaoheihe.cn/app/bbs/link/654/?from=profile#xhh-native-comments',
);
const crossHostCommentsUrl = native.makeFrameUrl(
  'https://xiaoheihe.cn/app/bbs/link/654',
  'comments',
  'https://www.xiaoheihe.cn',
);
assert.equal(
  crossHostCommentsUrl,
  'https://xiaoheihe.cn/app/bbs/link/654#xhh-native-comments?parentOrigin=https%3A%2F%2Fwww.xiaoheihe.cn',
);
assert.deepEqual(native.getFrameRequest(new URL(crossHostCommentsUrl).hash), {
  mode: 'comments',
  index: 0,
  parentOrigin: 'https://www.xiaoheihe.cn',
});
assert.equal(native.makeFrameUrl(
  'https://xiaoheihe.cn/app/bbs/link/654',
  'comments',
  'https://evil.xiaoheihe.cn',
), null);
assert.deepEqual(native.getFrameRequest('#xhh-native-comments'), { mode: 'comments', index: 0 });
assert.equal(native.getFrameRequest('#xhh-native-like'), null);
assert.equal(native.getFrameRequest('#xhh-native-gallery'), null);
assert.equal(native.getFrameRequest('#anything-else'), null);

assert.equal(native.isFrameMessage({
  type: 'xhh-native:comments-ready',
  postUrl: 'https://xiaoheihe.cn/app/bbs/link/987',
}), true);
assert.equal(native.isFrameMessage({
  type: 'xhh-native:gallery-data',
  postUrl: 'https://xiaoheihe.cn/app/bbs/link/987',
  urls: ['https://cdn.example.com/a.jpg'],
}), false);

const posted = [];
frameContent.send({
  location: { origin: 'https://xiaoheihe.cn' },
  parent: {
    postMessage(payload, targetOrigin) {
      posted.push({ payload, targetOrigin });
    },
  },
}, { type: 'ready' }, 'https://www.xiaoheihe.cn');
assert.deepEqual(posted, [{
  payload: { type: 'ready' },
  targetOrigin: 'https://www.xiaoheihe.cn',
}]);

console.log('module-tests: OK');
