(function exposeNativeInteractions(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.XiaoheiheNativeInteractions = api;
}(globalThis, function createNativeInteractions() {
  const SITE_ORIGIN = 'https://xiaoheihe.cn';
  const SITE_ORIGINS = new Set([
    SITE_ORIGIN,
    'https://www.xiaoheihe.cn',
  ]);
  const POST_PATH_PATTERN = /^\/app\/bbs\/link\/\d+\/?$/;
  const FRAME_PREFIX = '#xhh-native-';
  const FRAME_MODES = new Set(['comments']);
  const FRAME_MESSAGE_TYPES = new Set([
    'xhh-native:comments-ready',
    'xhh-native:frame-error',
  ]);

  function isPostUrl(postUrl) {
    try {
      const url = new URL(postUrl);
      return SITE_ORIGINS.has(url.origin) && POST_PATH_PATTERN.test(url.pathname);
    } catch {
      return false;
    }
  }

  function makeFrameUrl(postUrl, mode, parentOrigin) {
    if (!isPostUrl(postUrl) || !FRAME_MODES.has(mode)) {
      return null;
    }
    if (parentOrigin !== undefined && !isSiteOrigin(parentOrigin)) {
      return null;
    }
    const url = new URL(postUrl);
    const parentQuery = parentOrigin
      ? `?parentOrigin=${encodeURIComponent(parentOrigin)}`
      : '';
    url.hash = `${FRAME_PREFIX}${mode}${parentQuery}`;
    return url.href;
  }

  function isSiteOrigin(origin) {
    return SITE_ORIGINS.has(origin);
  }

  function getPostId(postUrl) {
    if (!isPostUrl(postUrl)) {
      return null;
    }
    return new URL(postUrl).pathname.match(/\/(\d+)\/?$/)?.[1] || null;
  }

  function getFrameRequest(hash) {
    if (typeof hash !== 'string' || !hash.startsWith(FRAME_PREFIX)) {
      return null;
    }
    const [mode, query = ''] = hash.slice(FRAME_PREFIX.length).split('?');
    if (!FRAME_MODES.has(mode)) {
      return null;
    }
    const request = { mode, index: 0 };
    if (query) {
      const parentOrigin = new URLSearchParams(query).get('parentOrigin');
      if (!isSiteOrigin(parentOrigin)) return null;
      request.parentOrigin = parentOrigin;
    }
    return request;
  }

  function isFrameMessage(message) {
    if (!message || typeof message !== 'object') {
      return false;
    }
    if (!FRAME_MESSAGE_TYPES.has(message.type) || !isPostUrl(message.postUrl)) {
      return false;
    }
    return true;
  }

  return {
    SITE_ORIGIN,
    getFrameRequest,
    getPostId,
    isFrameMessage,
    isPostUrl,
    isSiteOrigin,
    makeFrameUrl,
  };
}));
