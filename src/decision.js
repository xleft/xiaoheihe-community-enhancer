(function exposeDecisionModule(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.XiaoheiheNewTabDecision = api;
}(globalThis, function createDecisionModule() {
  const HOME_PATH = '/app/bbs/home';
  const SEARCH_LIST_PATH = '/app/search/list';
  const SITE_ORIGINS = new Set([
    'https://xiaoheihe.cn',
    'https://www.xiaoheihe.cn',
  ]);
  const POST_PATH_PATTERN = /^\/app\/bbs\/link\/\d+\/?$/;

  function isPostUrl(href) {
    try {
      const url = new URL(href);
      return SITE_ORIGINS.has(url.origin) && POST_PATH_PATTERN.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isSupportedListPath(pathname) {
    return pathname === HOME_PATH || pathname === SEARCH_LIST_PATH;
  }

  function shouldEnhancePost(input) {
    return Boolean(input && isPostUrl(input.href));
  }

  function shouldOpenPost(input) {
    if (!shouldEnhancePost(input) || input.excludedTarget) {
      return false;
    }

    if (input.button !== 0 || input.ctrlKey || input.metaKey || input.shiftKey || input.altKey) {
      return false;
    }

    return true;
  }

  return {
    HOME_PATH,
    SEARCH_LIST_PATH,
    isPostUrl,
    isSupportedListPath,
    shouldEnhancePost,
    shouldOpenPost,
  };
}));
