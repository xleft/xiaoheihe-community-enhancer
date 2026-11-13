'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sourceFiles = fs.readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.js'));
const allSource = sourceFiles
  .map((name) => fs.readFileSync(path.join(root, 'src', name), 'utf8'))
  .join('\n');
const content = fs.readFileSync(path.join(root, 'src', 'content.js'), 'utf8');
const pageBridge = fs.readFileSync(path.join(root, 'src', 'page-feed-bridge.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'src', 'service-worker.js'), 'utf8');
const popupExists = fs.existsSync(path.join(root, 'popup', 'popup.html'));
const popupHtml = popupExists
  ? fs.readFileSync(path.join(root, 'popup', 'popup.html'), 'utf8')
  : '';

assert.equal(manifest.version, '0.7.2');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.permissions.includes('scripting'), false);
assert.equal(manifest.host_permissions.includes('https://api.xiaoheihe.cn/*'), false);
assert.equal(manifest.host_permissions.includes('https://xiaoheihe.cn/*'), true);
assert.equal(manifest.host_permissions.includes('https://www.xiaoheihe.cn/*'), true);
assert.equal(/index-[A-Za-z0-9_-]+\.js/.test(allSource), false);
assert.equal(manifest.action?.default_popup, 'popup/popup.html');
assert.equal(manifest.action?.default_title, '小黑盒体验设置');
assert.equal(popupExists, true);
assert.equal(popupHtml.includes('id="enabled"'), true);
assert.equal(popupHtml.includes('name="open-mode"'), true);
assert.equal(popupHtml.includes('id="return-to-source"'), true);
assert.equal(popupHtml.includes('id="image-viewer"'), true);
assert.equal(popupHtml.includes('id="multi-image-completion"'), true);
assert.equal(popupHtml.includes('name="comment-mode"'), true);
assert.equal(popupHtml.includes('id="reset-settings"'), true);
assert.equal(serviceWorker.includes("importScripts('decision.js', 'settings.js', 'tab-behavior.js')"), true);
assert.equal(serviceWorker.includes('loadSettings(chrome.storage.local)'), true);

const mainBridge = manifest.content_scripts.find((item) => item.js?.includes('src/page-feed-bridge.js'));
assert.ok(mainBridge);
assert.equal(mainBridge.world, 'MAIN');
assert.equal(mainBridge.run_at, 'document_start');
assert.deepEqual(mainBridge.matches, [
  'https://xiaoheihe.cn/*',
  'https://www.xiaoheihe.cn/*',
]);

const listContent = manifest.content_scripts.find((item) => item.js?.includes('src/content.js'));
assert.ok(listContent);
assert.equal(listContent.js.includes('src/settings.js'), true);
assert.deepEqual(listContent.matches, [
  'https://xiaoheihe.cn/*',
  'https://www.xiaoheihe.cn/*',
]);
assert.equal(content.includes('.hb-cpt__bbs-list-content'), false);
assert.equal(content.includes('.hb-cpt-avatar'), true);
assert.equal(content.includes('.list-cotent__operation-btn'), true);
assert.equal(content.includes('const nativeControlSelector = ['), true);
assert.equal(content.includes('Boolean(target.closest(nativeControlSelector))'), true);
assert.equal(content.includes('window.location.pathname === decision.SEARCH_LIST_PATH'), false);
assert.equal(content.includes('settingsGate.getBehavior()'), true);
assert.equal(content.includes('createSettingsGate'), true);
assert.equal(content.includes('subscribeToSettings'), true);
assert.equal(content.includes('.catch(() => applySettings(settingsApi.DEFAULT_SETTINGS))'), false);
assert.equal(content.includes('.catch(() => {});'), true);
assert.equal(content.includes("openMode: behavior.openInBackground ? 'background' : 'foreground'"), true);
assert.equal(content.includes('returnToSource: behavior.returnToSource'), true);
assert.equal(content.includes("const commentSelector = '.bbs-new-style-bottom__comment, .content-list__comment';"), true);
assert.equal(content.includes('function mergeImageLists('), true);
assert.equal(content.includes('mergeImageLists(previous.urls, urls, mergedTotalCount)'), true);
assert.equal(content.includes('behavior.imageViewer'), true);
assert.equal(content.includes('behavior.commentsPopup'), true);
assert.equal(content.includes('behavior.multiImageCompletion'), true);
assert.equal(content.includes('if (!candidate.needsRemote) continue;'), true);

const excludedSelectorSource = content.match(/const excludedSelector = \[([\s\S]*?)\]\.join\(','\);/)?.[1] || '';
assert.equal(excludedSelectorSource.includes('.bbs-content__video_wrapper'), false);
assert.equal(excludedSelectorSource.includes("'video'"), true);
assert.equal(excludedSelectorSource.includes("'audio'"), true);

// 图片补全必须来自首页 Feed API 缓存，不再创建详情页 iframe。
assert.equal(pageBridge.includes("'/bbs/app/feeds'"), true);
assert.equal(pageBridge.includes("'/bbs/app/api/general/search/v1/web'"), true);
assert.equal(pageBridge.includes("'/bbs/app/topic/feeds'"), true);
assert.equal(pageBridge.includes("'/bbs/app/profile/events'"), true);
assert.equal(pageBridge.includes("'/bbs/app/profile/user/link/list_v2'"), true);
assert.equal(pageBridge.includes('link.imgs'), true);
assert.equal(pageBridge.includes('result.post_links'), true);
assert.equal(pageBridge.includes('result.moments'), true);
assert.equal(pageBridge.includes('response.clone().json()'), true);
assert.equal(content.includes('request-feed-images'), true);
assert.equal(content.includes('feedImageCache'), true);
assert.equal(content.includes('preloadRemoteImage'), true);
assert.equal(content.includes('xhh-gallery-bridge'), false);
assert.equal(allSource.includes('xhh-native:gallery-data'), false);
assert.equal(allSource.includes('.header-image__item-image'), false);
assert.equal(allSource.includes('sendGalleryData'), false);

// 1~3 图不触发后续补图；明确 >3 才启用。
assert.equal(content.includes('knownTotal > 3'), true);
assert.equal(content.includes('if (state.needsRemote) startRemoteFetch(\'background\')'), true);
assert.equal(content.includes("querySelectorAll(':scope > .bbs-content__image')"), true);
assert.equal(content.includes('Feed API 只负责补第 4 张及以后'), true);

// 自定义 Viewer 的可滚动画布仍保留。
assert.equal(content.includes('xhh-gallery-viewport'), true);
assert.equal(content.includes('place-items: center'), false);
assert.equal(content.includes('translate(${state.panX}px'), false);
assert.equal(content.includes('这张图片暂时加载失败'), true);
assert.equal(content.includes('重新加载'), true);

console.log('static-check: OK');

// 0.5.8：列表点赞增强彻底移除，点赞区域交还小黑盒原生页面。
assert.equal(content.includes('requestDirectLike'), false);
assert.equal(content.includes('pendingLikeRequests'), false);
assert.equal(content.includes("type: 'award-link'"), false);
assert.equal(pageBridge.includes('/bbs/app/profile/award/link'), false);
assert.equal(allSource.includes('xhh-native:like-result'), false);
assert.equal(allSource.includes('xhh-native-like-fallback'), false);
assert.equal(content.includes('likeSelector,'), true);
assert.equal(content.includes('commentSelector,'), true);
console.log('like-removal-static-check: OK');

if (content.includes('FEED_BRIDGE_CLIENT')) {
  if (!content.includes('const FEED_BRIDGE_CLIENT = FEED_CLIENT_SOURCE;')) {
    throw new Error('FEED_BRIDGE_CLIENT must be defined when referenced');
  }
}
