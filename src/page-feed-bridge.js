(() => {
  'use strict';

  const API_ORIGIN = 'https://api.xiaoheihe.cn';
  const LIST_DATA_PATHS = new Set([
    '/bbs/app/feeds',
    '/bbs/app/api/general/search/v1',
    '/bbs/app/api/general/search/v1/web',
    '/bbs/app/topic/feeds',
    '/bbs/app/topic/feeds/news',
    '/bbs/app/profile/events',
    '/bbs/app/profile/user/link/list',
    '/bbs/app/profile/user/link/list_v2',
  ]);
  const BRIDGE_SOURCE = 'xhh-community-feed-bridge';
  const CLIENT_SOURCE = 'xhh-community-content';
  const cache = new Map();

  if (window.__xhhCommunityFeedBridgeInstalled) {
    return;
  }
  window.__xhhCommunityFeedBridgeInstalled = true;

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return '';
  }

  function isListDataUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.origin === API_ORIGIN && LIST_DATA_PATHS.has(url.pathname);
    } catch {
      return false;
    }
  }


  function normalizeUrl(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
      return trimmed;
    }
    if (!value || typeof value !== 'object') return '';
    for (const key of ['url', 'src', 'image', 'original', 'origin_url']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    }
    return '';
  }

  function imageList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const urls = [];
    for (const item of value) {
      const url = normalizeUrl(item);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    return urls;
  }

  function mergeImageLists(existing, incoming, totalCount) {
    const length = Math.max(totalCount, existing.length, incoming.length);
    const merged = Array(length).fill('');
    existing.forEach((url, index) => { if (url) merged[index] = url; });
    incoming.forEach((url, index) => { if (url) merged[index] = url; });
    return merged;
  }

  function postEntry(entry) {
    window.postMessage({
      source: BRIDGE_SOURCE,
      type: 'feed-images',
      linkId: entry.linkId,
      urls: entry.urls,
      thumbs: entry.thumbs,
      totalCount: entry.totalCount,
    }, window.location.origin);
  }

  function cacheLink(link) {
    if (!link || typeof link !== 'object') return;
    const linkId = String(link.linkid || link.link_id || link.id || '').trim();
    if (!/^\d+$/.test(linkId)) return;

    const urls = imageList(link.imgs);
    const thumbs = imageList(link.thumbs);
    const totalCount = Math.max(urls.length, thumbs.length);
    if (totalCount <= 0) return;

    const previous = cache.get(linkId) || { totalCount: 0, urls: [], thumbs: [] };
    const mergedTotalCount = Math.max(previous.totalCount, totalCount);
    // 多个列表接口可能返回同一帖子；保留已有非空图片，不让缩略图数量相同但原图更少的响应降级缓存。
    const entry = {
      linkId,
      urls: mergeImageLists(previous.urls, urls, mergedTotalCount),
      thumbs: mergeImageLists(previous.thumbs, thumbs, mergedTotalCount),
      totalCount: mergedTotalCount,
    };
    cache.set(linkId, entry);
    postEntry(entry);
  }

  function cachePayload(data) {
    const result = data && typeof data.result === 'object' ? data.result : {};
    const links = Array.isArray(result.links) ? result.links : [];
    for (const link of links) cacheLink(link);

    const postLinks = Array.isArray(result.post_links) ? result.post_links : [];
    for (const link of postLinks) cacheLink(link);

    const moments = Array.isArray(result.moments) ? result.moments : [];
    for (const moment of moments) cacheLink(moment && moment.link ? moment.link : moment);
  }

  function cacheResponseText(text) {
    if (typeof text !== 'string' || !text) return;
    try {
      cachePayload(JSON.parse(text));
    } catch {
      // 非 JSON 响应忽略，不影响原网页请求。
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (...args) {
      const url = requestUrl(args[0]);
      const result = originalFetch.apply(this, args);
      if (isListDataUrl(url)) {
        result.then((response) => response.clone().json())
          .then(cachePayload)
          .catch(() => {});
      }
      return result;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const requestValue = requestUrl(url);
    const listDataRequest = isListDataUrl(requestValue);
    if (listDataRequest) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === 'json') {
            cachePayload(this.response);
          } else if (!this.responseType || this.responseType === 'text') {
            cacheResponseText(this.responseText);
          }
        } catch {
          // 读取响应失败时不干扰小黑盒原请求。
        }
      }, { once: true });
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== CLIENT_SOURCE) return;

    if (data.type === 'request-feed-images') {
      const linkId = String(data.linkId || '').trim();
      const entry = cache.get(linkId);
      if (entry) postEntry(entry);
      return;
    }

  });
})();
