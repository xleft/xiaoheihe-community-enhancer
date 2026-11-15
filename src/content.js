(() => {
  const decision = globalThis.XiaoheiheNewTabDecision;
  const nativeInteractions = globalThis.XiaoheiheNativeInteractions;
  const settingsApi = globalThis.XiaoheiheSettings;
  const imageSelector = '.bbs-content__imgs-wrapper .bbs-content__image';
  const nativeControlSelector = [
    '.hb-cpt-avatar',
    '.header__user',
    '.list-content__username',
    '.list-cotent__operation-btn',
  ].join(',');
  const commentSelector = '.bbs-new-style-bottom__comment, .content-list__comment';
  const likeSelector = '.content-list__like, .bbs-new-style-bottom__like';
  const excludedSelector = [
    imageSelector,
    commentSelector,
    likeSelector,
    'video',
    'audio',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable="true"]',
  ].join(',');
  const activeFrames = new Map();
  const feedImageCache = new Map();
  const FEED_BRIDGE_SOURCE = 'xhh-community-feed-bridge';
  const FEED_CLIENT_SOURCE = 'xhh-community-content';
  const settingsGate = settingsApi ? settingsApi.createSettingsGate() : null;
  // Backward-compatible alias: prevents stale 0.5.7 handlers from failing after an unpacked-extension reload.
  const FEED_BRIDGE_CLIENT = FEED_CLIENT_SOURCE;

  if (!decision || !nativeInteractions || !settingsApi || window.top !== window) {
    return;
  }

  function isPlainPrimaryClick(event) {
    return event.button === 0
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && !event.altKey;
  }

  function mergeImageLists(existing, incoming, totalCount) {
    const length = Math.max(totalCount, existing.length, incoming.length);
    const merged = Array(length).fill('');
    existing.forEach((url, index) => { if (url) merged[index] = url; });
    incoming.forEach((url, index) => { if (url) merged[index] = url; });
    return merged;
  }

  function ensureOverlayStyles() {
    if (!document.head || document.getElementById('xhh-native-overlay-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'xhh-native-overlay-style';
    style.textContent = `
      .xhh-gallery-overlay {
        animation: xhh-gallery-fade-in .12s ease-out;
        background: rgba(5, 7, 11, .78);
        /* Avoid full-screen backdrop filtering over animated list content. */
        inset: 0;
        position: fixed;
        z-index: 2147483647;
      }
      .xhh-gallery-viewport {
        inset: 56px 74px 52px;
        overflow: auto;
        overscroll-behavior: contain;
        position: absolute;
        scrollbar-color: rgba(255,255,255,.24) transparent;
        scrollbar-width: thin;
      }
      .xhh-gallery-canvas {
        box-sizing: border-box;
        min-height: 100%;
        min-width: 100%;
        position: relative;
      }
      .xhh-gallery-image {
        display: block;
        max-height: none;
        max-width: none;
        object-fit: contain;
        position: absolute;
        user-select: none;
        -webkit-user-drag: none;
      }
      .xhh-gallery-image[data-preview="true"] {
        filter: saturate(.96);
      }
      .xhh-gallery-close,
      .xhh-gallery-nav {
        align-items: center;
        background: rgba(19, 23, 31, .72);
        border: 1px solid rgba(255, 255, 255, .10);
        border-radius: 999px;
        color: rgba(255,255,255,.95);
        cursor: pointer;
        display: flex;
        justify-content: center;
        position: fixed;
        transition: background .12s ease, opacity .12s ease, transform .12s ease;
        z-index: 3;
      }
      .xhh-gallery-close:hover,
      .xhh-gallery-nav:hover:not(:disabled) {
        background: rgba(30, 35, 46, .92);
      }
      .xhh-gallery-close {
        font-size: 27px;
        height: 40px;
        line-height: 1;
        right: 18px;
        top: 16px;
        width: 40px;
      }
      .xhh-gallery-nav {
        font-size: 34px;
        height: 52px;
        padding: 0 0 3px;
        top: 50%;
        transform: translateY(-50%);
        width: 52px;
      }
      .xhh-gallery-nav--prev { left: 14px; }
      .xhh-gallery-nav--next { right: 14px; }
      .xhh-gallery-nav:disabled {
        cursor: default;
        opacity: .18;
      }
      .xhh-gallery-counter,
      .xhh-gallery-status {
        backdrop-filter: blur(8px);
        background: rgba(13, 17, 24, .68);
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 999px;
        color: rgba(255, 255, 255, .92);
        left: 50%;
        position: fixed;
        transform: translateX(-50%);
        z-index: 3;
      }
      .xhh-gallery-counter {
        bottom: 16px;
        font-size: 13px;
        line-height: 1;
        min-width: 42px;
        padding: 8px 12px;
        text-align: center;
      }
      .xhh-gallery-status {
        bottom: 54px;
        font-size: 12px;
        opacity: 0;
        padding: 7px 11px;
        pointer-events: none;
        transition: opacity .14s ease;
      }
      .xhh-gallery-status[data-visible="true"] { opacity: 1; }
      .xhh-gallery-status[data-error="true"] {
        background: rgba(92, 28, 32, .80);
      }
      .xhh-gallery-placeholder {
        align-items: center;
        color: rgba(255,255,255,.82);
        display: flex;
        flex-direction: column;
        gap: 12px;
        left: 50%;
        max-width: 360px;
        position: absolute;
        text-align: center;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
      }
      .xhh-gallery-placeholder[hidden] { display: none !important; }
      .xhh-gallery-placeholder__text { font-size: 14px; line-height: 1.6; }
      .xhh-gallery-placeholder__retry {
        background: rgba(255,255,255,.11);
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 10px;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        padding: 8px 14px;
      }
      .xhh-gallery-placeholder__retry:hover { background: rgba(255,255,255,.17); }
      .xhh-native-comments-overlay {
        align-items: center;
        background: rgba(0, 0, 0, .72);
        display: flex;
        inset: 0;
        justify-content: center;
        position: fixed;
        z-index: 2147483647;
      }
      .xhh-native-comments-dialog {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 18px 60px rgba(0,0,0,.22);
        height: min(88vh, 1000px);
        overflow: hidden;
        position: relative;
        width: min(960px, 94vw);
      }
      .xhh-native-comments-dialog > button {
        background: #111827;
        border: 0;
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        padding: 9px 14px;
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: 4;
      }
      .xhh-native-comments-frame {
        border: 0;
        height: 100%;
        opacity: 0;
        pointer-events: none;
        transition: opacity .08s linear;
        width: 100%;
      }
      .xhh-native-comments-loading {
        color: #6b7280;
        font-size: 14px;
        left: 50%;
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
      }
      @keyframes xhh-gallery-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @media (max-width: 760px) {
        .xhh-gallery-viewport { inset: 54px 12px 50px; }
        .xhh-gallery-nav { height: 44px; width: 44px; }
        .xhh-gallery-nav--prev { left: 8px; }
        .xhh-gallery-nav--next { right: 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeFrameState(state) {
    if (!state) {
      return;
    }
    if (state.mapKey) {
      activeFrames.delete(state.mapKey);
    } else if (state.frame) {
      activeFrames.delete(state.frame);
    }
    if (state.timeoutId !== null && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
    if (state.statusTimer !== null && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(state.statusTimer);
      state.statusTimer = null;
    }
    if (typeof state.cleanup === 'function') {
      state.cleanup();
      state.cleanup = null;
    }
    if (state.preloaders && typeof state.preloaders.clear === 'function') {
      state.preloaders.clear();
    }
    if (state.overlay) {
      state.overlay.remove();
    }
    if (state.frame) {
      state.frame.remove();
    }
  }

  function applySettings(nextSettings) {
    settingsGate.apply(nextSettings);
    const behavior = settingsGate.getBehavior();

    for (const state of [...activeFrames.values()]) {
      if (!behavior.enabled
        || (state.type === 'gallery' && !behavior.imageViewer)
        || (state.type === 'comments' && !behavior.commentsPopup)) {
        removeFrameState(state);
        continue;
      }

      if (state.type === 'gallery') {
        state.needsRemote = Boolean(behavior.multiImageCompletion
          && state.postId
          && state.totalCount > 3);
        if (!state.needsRemote) {
          if (state.timeoutId !== null) globalThis.clearTimeout(state.timeoutId);
          state.timeoutId = null;
          state.remoteStatus = 'disabled';
        } else if (typeof state.startRemoteFetch === 'function') {
          state.remoteStatus = 'idle';
          state.startRemoteFetch('background');
        }
      }
    }
  }

  void settingsApi.loadSettings(chrome.storage.local)
    .then(applySettings)
    .catch(() => {});
  settingsApi.subscribeToSettings(chrome.storage.onChanged, applySettings);

  function normalizeImageUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return '';
    }
    try {
      return new URL(trimmed, window.location.href).href;
    } catch {
      return trimmed;
    }
  }

  function largestSrcsetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }
    const parsed = value.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const bits = part.split(/\s+/);
        const rawUrl = bits[0] || '';
        const descriptor = bits[1] || '';
        let score = 0;
        if (/\d+w$/i.test(descriptor)) {
          score = Number.parseInt(descriptor, 10) || 0;
        } else if (/\d+(?:\.\d+)?x$/i.test(descriptor)) {
          score = Math.round((Number.parseFloat(descriptor) || 0) * 10000);
        }
        return { score, url: normalizeImageUrl(rawUrl) };
      })
      .filter((item) => item.url);
    parsed.sort((a, b) => b.score - a.score);
    return parsed.length > 0 ? parsed[0].url : '';
  }

  function backgroundUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const match = value.match(/url\(\s*(['\"]?)(.*?)\1\s*\)/i);
    return match && match[2] ? normalizeImageUrl(match[2]) : '';
  }

  function imageUrlFromElement(element) {
    if (!(element instanceof Element)) {
      return '';
    }
    const candidates = [];
    const srcset = largestSrcsetUrl(element.getAttribute('srcset'));
    if (srcset) candidates.push(srcset);
    if ('currentSrc' in element) candidates.push(element.currentSrc);
    if ('src' in element) candidates.push(element.src);
    for (const name of ['data-original', 'data-origin', 'data-src', 'data-lazy-src']) {
      candidates.push(element.getAttribute(name));
    }
    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) return normalized;
    }
    const inline = backgroundUrl(element.style && element.style.backgroundImage);
    if (inline) return inline;
    try {
      return backgroundUrl(getComputedStyle(element).backgroundImage);
    } catch {
      return '';
    }
  }

  function readPreviewUrl(tile) {
    if (!(tile instanceof Element) || !tile.matches('.bbs-content__image')) {
      return '';
    }
    // 只读正文图片格内部的媒体，不扫帖子其它 img / icon / avatar。
    const candidates = [];
    const source = tile.querySelector('picture source[srcset], source[srcset]');
    const image = tile.querySelector('img');
    if (source) candidates.push(source);
    if (image) candidates.push(image);
    candidates.push(tile);
    for (const element of candidates) {
      const url = imageUrlFromElement(element);
      if (url) return url;
    }
    return '';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseDeclaredImageCount(imageGroup, visibleCount) {
    if (!(imageGroup instanceof Element)) return visibleCount;
    const markers = [...imageGroup.querySelectorAll('.bbs-content__image-cnt')];
    for (const marker of markers) {
      const raw = [
        marker.textContent,
        marker.getAttribute('aria-label'),
        marker.getAttribute('title'),
        marker.getAttribute('data-count'),
        marker.getAttribute('data-total'),
      ].filter(Boolean).join(' ').trim();
      if (!raw) continue;
      const plusMatch = raw.match(/\+\s*(\d+)/);
      if (plusMatch) {
        const remaining = Number.parseInt(plusMatch[1], 10);
        if (Number.isFinite(remaining) && remaining > 0) {
          return Math.max(visibleCount + remaining, visibleCount);
        }
      }
      const values = [...raw.matchAll(/\d+/g)]
        .map((match) => Number.parseInt(match[0], 10))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (values.length) return Math.max(visibleCount, Math.max(...values));
    }
    return visibleCount;
  }

  function collectListPreviewUrls(imageTile, postUrl) {
    const behavior = settingsGate.getBehavior();
    const imageGroup = imageTile instanceof Element ? imageTile.closest('.bbs-content__imgs-wrapper') : null;
    const tiles = imageGroup
      ? [...imageGroup.querySelectorAll(':scope > .bbs-content__image')]
      : (imageTile ? [imageTile] : []);
    const entries = [];
    for (const tile of tiles) {
      const url = readPreviewUrl(tile);
      if (url) entries.push({ tile, url });
    }
    if (!entries.length) {
      const fallback = readPreviewUrl(imageTile);
      if (fallback) entries.push({ tile: imageTile, url: fallback });
    }
    const visibleCount = entries.length;
    const declaredCount = parseDeclaredImageCount(imageGroup, visibleCount);
    const postId = nativeInteractions.getPostId(postUrl);
    const cached = behavior.multiImageCompletion && postId ? feedImageCache.get(postId) : null;
    const cachedCount = cached ? Math.max(cached.totalCount || 0, cached.urls.length) : 0;
    const knownTotal = Math.max(visibleCount, declaredCount, cachedCount);
    const clickedIndex = entries.findIndex((entry) => entry.tile === imageTile);
    return {
      index: clickedIndex >= 0 ? clickedIndex : 0,
      needsRemote: behavior.multiImageCompletion && knownTotal > 3,
      postId,
      totalCount: knownTotal,
      urls: entries.map((entry) => entry.url),
    };
  }

  function openGallery(postUrl, initialIndex, imageTile, _postLink) {
    if (!document.body) {
      return false;
    }

    const previews = collectListPreviewUrls(imageTile, postUrl);
    const fallbackUrl = readPreviewUrl(imageTile);
    const localUrls = previews.urls.length ? previews.urls : (fallbackUrl ? [fallbackUrl] : []);
    if (!localUrls.length) return false;
    const totalCount = Math.max(localUrls.length, previews.totalCount || localUrls.length);

    ensureOverlayStyles();
    const overlay = document.createElement('div');
    const viewport = document.createElement('div');
    const canvas = document.createElement('div');
    const image = document.createElement('img');
    const placeholder = document.createElement('div');
    const placeholderText = document.createElement('div');
    const retryButton = document.createElement('button');
    const closeButton = document.createElement('button');
    const previousButton = document.createElement('button');
    const nextButton = document.createElement('button');
    const counter = document.createElement('div');
    const status = document.createElement('div');
    const urls = Array(totalCount).fill('');
    localUrls.forEach((url, index) => { urls[index] = url; });
    const localIndex = previews.urls.length ? previews.index : initialIndex;
    const state = {
      autoRetryUsed: false, baseHeight: 0, baseWidth: 0, canvas, cleanup: null, counter, drag: null,
      frame: null, image, ignoreCanvasClick: false,
      index: clamp(localIndex >= 0 ? localIndex : initialIndex, 0, Math.max(totalCount - 1, 0)),
      isLong: false, loadToken: 0, localUrls: localUrls.slice(), mapKey: overlay,
      needsRemote: Boolean(previews.needsRemote && previews.postId), nextButton, overlay, placeholder, placeholderText,
      postId: previews.postId || '', preloaders: new Map(), previousButton,
      remoteStatus: previews.needsRemote ? 'idle' : 'disabled', retryButton,
      status, statusTimer: null, timeoutId: null, totalCount, type: 'gallery', urls, viewport, zoom: 1,
    };

    overlay.className = 'xhh-gallery-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '帖子图片预览');
    viewport.className = 'xhh-gallery-viewport';
    canvas.className = 'xhh-gallery-canvas';
    image.className = 'xhh-gallery-image';
    image.alt = '帖子图片';
    image.draggable = false;
    image.hidden = true;

    placeholder.className = 'xhh-gallery-placeholder';
    placeholder.hidden = true;
    placeholderText.className = 'xhh-gallery-placeholder__text';
    retryButton.className = 'xhh-gallery-placeholder__retry';
    retryButton.type = 'button';
    retryButton.textContent = '重新加载';
    retryButton.hidden = true;
    placeholder.appendChild(placeholderText);
    placeholder.appendChild(retryButton);

    closeButton.className = 'xhh-gallery-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭图片预览');
    closeButton.textContent = '×';

    previousButton.className = 'xhh-gallery-nav xhh-gallery-nav--prev';
    previousButton.type = 'button';
    previousButton.setAttribute('aria-label', '上一张');
    previousButton.textContent = '‹';

    nextButton.className = 'xhh-gallery-nav xhh-gallery-nav--next';
    nextButton.type = 'button';
    nextButton.setAttribute('aria-label', '下一张');
    nextButton.textContent = '›';

    counter.className = 'xhh-gallery-counter';
    status.className = 'xhh-gallery-status';
    status.textContent = '正在加载原图…';
    status.dataset.visible = 'false';
    status.dataset.error = 'false';

    function showStatus(text, isError = false, autoHideMs = 0) {
      if (state.statusTimer !== null) {
        globalThis.clearTimeout(state.statusTimer);
        state.statusTimer = null;
      }
      status.textContent = text;
      status.dataset.error = String(Boolean(isError));
      status.dataset.visible = 'true';
      if (autoHideMs > 0) {
        state.statusTimer = globalThis.setTimeout(() => {
          state.statusTimer = null;
          status.dataset.visible = 'false';
          status.dataset.error = 'false';
        }, autoHideMs);
      }
    }

    function hideStatus() {
      if (state.statusTimer !== null) {
        globalThis.clearTimeout(state.statusTimer);
        state.statusTimer = null;
      }
      status.dataset.visible = 'false';
      status.dataset.error = 'false';
    }

    function updateNavigation() {
      const hasMany = state.totalCount > 1;
      previousButton.hidden = !hasMany;
      nextButton.hidden = !hasMany;
      counter.hidden = !hasMany;
      previousButton.disabled = !hasMany || state.index <= 0;
      nextButton.disabled = !hasMany || state.index >= state.totalCount - 1;
      if (hasMany) counter.textContent = `${state.index + 1} / ${state.totalCount}`;
    }

    function imageGeometry() {
      return {
        height: Number.parseFloat(image.style.height) || 0,
        left: Number.parseFloat(image.style.left) || 0,
        top: Number.parseFloat(image.style.top) || 0,
        width: Number.parseFloat(image.style.width) || 0,
      };
    }

    function applyDimensions() {
      if (!state.baseWidth || !state.baseHeight) {
        return imageGeometry();
      }

      const padding = 18;
      const zoom = state.isLong ? 1 : state.zoom;
      const width = Math.max(1, Math.round(state.baseWidth * zoom));
      const height = Math.max(1, Math.round(state.baseHeight * zoom));
      const stageWidth = Math.max(viewport.clientWidth, width + padding * 2);
      const stageHeight = Math.max(viewport.clientHeight, height + padding * 2);
      const left = Math.max(padding, Math.round((stageWidth - width) / 2));
      const top = Math.max(padding, Math.round((stageHeight - height) / 2));

      canvas.style.width = `${stageWidth}px`;
      canvas.style.height = `${stageHeight}px`;
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      image.style.left = `${left}px`;
      image.style.top = `${top}px`;

      return { height, left, top, width };
    }

    function positionInitialView() {
      const geometry = imageGeometry();
      if (!geometry.width || !geometry.height) {
        return;
      }
      viewport.scrollLeft = Math.max(0, geometry.left + geometry.width / 2 - viewport.clientWidth / 2);
      viewport.scrollTop = state.isLong
        ? 0
        : Math.max(0, geometry.top + geometry.height / 2 - viewport.clientHeight / 2);
    }

    function layoutImage(resetScroll = true) {
      if (!image.naturalWidth || !image.naturalHeight) {
        return;
      }
      const availableWidth = Math.max(180, viewport.clientWidth - 36);
      const availableHeight = Math.max(180, viewport.clientHeight - 36);
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      const aspect = naturalHeight / naturalWidth;
      state.isLong = aspect >= 2.8 && naturalHeight > availableHeight * 1.35;
      state.zoom = 1;

      let scale;
      if (state.isLong) {
        scale = Math.min(availableWidth / naturalWidth, 1);
      } else {
        scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
      }
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1;
      }
      state.baseWidth = naturalWidth * scale;
      state.baseHeight = naturalHeight * scale;
      applyDimensions();
      viewport.style.cursor = 'default';
      if (resetScroll) {
        globalThis.requestAnimationFrame(positionInitialView);
      }
    }

    function localFallbackForCurrent(url) {
      const candidate = state.localUrls[state.index] || '';
      return candidate && candidate !== url ? candidate : '';
    }

    function setImageSource(url, preview = false) {
      if (!url) {
        return;
      }
      const token = ++state.loadToken;
      image.hidden = true;
      image.dataset.preview = String(preview);

      if (!preview) {
        state.statusTimer = globalThis.setTimeout(() => {
          if (state.loadToken === token) {
            showStatus('正在加载原图…');
          }
        }, 360);
      }

      const onLoad = () => {
        if (state.loadToken !== token) {
          return;
        }
        hideStatus();
        image.hidden = false;
        layoutImage(true);
      };
      const onError = () => {
        if (state.loadToken !== token) {
          return;
        }
        const fallback = !preview ? localFallbackForCurrent(url) : '';
        if (fallback) {
          showStatus('原图加载失败，已显示列表预览图', false, 1800);
          setImageSource(fallback, true);
          return;
        }
        if (state.index >= state.localUrls.length) {
          showPendingImage('这张图片加载失败', true);
          return;
        }
        showStatus('这张图片加载失败', true);
      };
      image.onload = onLoad;
      image.onerror = onError;
      image.src = url;
    }

    function clearRemoteTimeout() {
      if (state.timeoutId !== null) {
        globalThis.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
    }

    function startRemoteFetch(reason = 'background') {
      if (!state.needsRemote || !state.postId || state.remoteStatus === 'loading') return false;
      clearRemoteTimeout();

      const cached = feedImageCache.get(state.postId);
      if (cached && Array.isArray(cached.urls) && cached.urls.length > state.localUrls.length) {
        mergeRemoteUrls(cached.urls);
        state.remoteStatus = 'complete';
        if (state.index >= state.localUrls.length && !state.urls[state.index]) renderCurrent();
        return true;
      }

      state.remoteStatus = 'loading';
      window.postMessage({
        source: FEED_CLIENT_SOURCE,
        type: 'request-feed-images',
        linkId: state.postId,
      }, window.location.origin);

      state.timeoutId = globalThis.setTimeout(() => {
        state.timeoutId = null;
        state.remoteStatus = 'failed';
        if (state.index >= state.localUrls.length && !state.urls[state.index]) renderCurrent();
      }, reason === 'manual' ? 5000 : 3000);
      return true;
    }

    function showPendingImage(textValue, canRetry) {
      ++state.loadToken;
      image.hidden = true;
      state.baseWidth = 0;
      state.baseHeight = 0;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      placeholderText.textContent = textValue;
      retryButton.hidden = !canRetry;
      placeholder.hidden = false;
      hideStatus();
    }

    function hidePendingImage() {
      placeholder.hidden = true;
      retryButton.hidden = true;
    }

    function renderCurrent() {
      state.index = clamp(state.index, 0, Math.max(state.totalCount - 1, 0));
      updateNavigation();
      const url = state.urls[state.index] || '';
      if (url) {
        hidePendingImage();
        setImageSource(url, state.index < state.localUrls.length);
        return;
      }
      if (!state.needsRemote) {
        showPendingImage('这张图片暂时无法显示', false);
        return;
      }
      if (state.remoteStatus === 'idle') {
        startRemoteFetch('background');
      } else if ((state.remoteStatus === 'failed' || state.remoteStatus === 'complete') && !state.autoRetryUsed) {
        // 后台预加载没拿到当前后续图时，用户真正翻到这里再自动重试一次。
        state.autoRetryUsed = true;
        state.remoteStatus = 'failed';
        startRemoteFetch('demand');
      }
      if (state.remoteStatus === 'loading') showPendingImage('正在加载这张图片…', false);
      else showPendingImage('这张图片暂时加载失败', true);
    }

    function goTo(index) {
      const nextIndex = clamp(index, 0, Math.max(state.totalCount - 1, 0));
      if (nextIndex === state.index) return;
      state.index = nextIndex;
      renderCurrent();
    }

    function preloadRemoteImage(index, url) {
      if (!url || index < state.localUrls.length) return;
      const existing = state.preloaders.get(index);
      if (existing && existing.dataset && existing.dataset.url === url) return;
      const loader = new Image();
      loader.dataset.url = url;
      state.preloaders.set(index, loader);
      loader.onload = () => {
        if (state.preloaders.get(index) === loader) loader.dataset.state = 'ready';
      };
      loader.onerror = () => {
        if (state.preloaders.get(index) === loader) loader.dataset.state = 'failed';
      };
      loader.src = url;
    }

    function mergeRemoteUrls(remoteUrls) {
      if (!Array.isArray(remoteUrls) || !remoteUrls.length) return false;
      const nextTotal = Math.max(state.totalCount, remoteUrls.length);
      if (nextTotal > state.totalCount) {
        const oldLength = state.urls.length;
        state.urls.length = nextTotal;
        for (let i = oldLength; i < nextTotal; i += 1) state.urls[i] = '';
        state.totalCount = nextTotal;
      }
      let changed = false;
      // 前三张/列表已有图绝不替换。Feed API 只负责补第 4 张及以后。
      for (let i = state.localUrls.length; i < remoteUrls.length; i += 1) {
        const url = normalizeImageUrl(remoteUrls[i]);
        if (url && state.urls[i] !== url) {
          state.urls[i] = url;
          changed = true;
        }
        if (url) preloadRemoteImage(i, url);
      }
      updateNavigation();
      if (changed && state.index >= state.localUrls.length && state.urls[state.index]) renderCurrent();
      return changed;
    }

    function acceptRemoteUrls(remoteUrls) {
      clearRemoteTimeout();
      const changed = mergeRemoteUrls(remoteUrls);
      state.remoteStatus = 'complete';
      if (!changed && state.index >= state.localUrls.length && !state.urls[state.index]) renderCurrent();
    }

    state.renderCurrent = renderCurrent;
    state.showStatus = showStatus;
    state.mergeRemoteUrls = mergeRemoteUrls;
    state.acceptRemoteUrls = acceptRemoteUrls;
    state.startRemoteFetch = startRemoteFetch;

    retryButton.addEventListener('click', () => {
      const currentUrl = state.urls[state.index] || '';
      if (currentUrl) {
        state.preloaders.delete(state.index);
        hidePendingImage();
        setImageSource(currentUrl, state.index < state.localUrls.length);
        return;
      }
      state.autoRetryUsed = true;
      state.remoteStatus = 'failed';
      startRemoteFetch('manual');
      renderCurrent();
    });
    closeButton.addEventListener('click', () => removeFrameState(state));
    previousButton.addEventListener('click', () => goTo(state.index - 1));
    nextButton.addEventListener('click', () => goTo(state.index + 1));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        removeFrameState(state);
      }
    });

    canvas.addEventListener('click', (event) => {
      if (state.ignoreCanvasClick) {
        state.ignoreCanvasClick = false;
        return;
      }
      if (event.target === canvas) {
        removeFrameState(state);
      }
    });

    image.addEventListener('dblclick', (event) => {
      if (state.isLong) {
        return;
      }
      state.zoom = 1;
      applyDimensions();
      globalThis.requestAnimationFrame(positionInitialView);
      event.preventDefault();
    });

    viewport.addEventListener('wheel', (event) => {
      if (image.hidden || state.isLong) {
        return;
      }
      event.preventDefault();
      const oldZoom = state.zoom;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = clamp(oldZoom * factor, 0.5, 8);
      if (Math.abs(nextZoom - oldZoom) < 0.001) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - viewportRect.left;
      const pointerY = event.clientY - viewportRect.top;
      const before = imageGeometry();
      const contentX = viewport.scrollLeft + pointerX;
      const contentY = viewport.scrollTop + pointerY;
      const anchorX = before.width > 0 ? clamp((contentX - before.left) / before.width, 0, 1) : 0.5;
      const anchorY = before.height > 0 ? clamp((contentY - before.top) / before.height, 0, 1) : 0.5;

      state.zoom = nextZoom;
      const after = applyDimensions();
      viewport.scrollLeft = Math.max(0, after.left + after.width * anchorX - pointerX);
      viewport.scrollTop = Math.max(0, after.top + after.height * anchorY - pointerY);
    }, { passive: false });

    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || image.hidden) {
        return;
      }
      const scrollable = viewport.scrollWidth > viewport.clientWidth + 2
        || viewport.scrollHeight > viewport.clientHeight + 2;
      if (!scrollable) {
        return;
      }
      state.drag = {
        didMove: false,
        pointerId: event.pointerId,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        x: event.clientX,
        y: event.clientY,
      };
      viewport.style.cursor = 'grabbing';
      if (typeof viewport.setPointerCapture === 'function') {
        viewport.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!state.drag || event.pointerId !== state.drag.pointerId) {
        return;
      }
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        state.drag.didMove = true;
      }
      viewport.scrollLeft = state.drag.scrollLeft - dx;
      viewport.scrollTop = state.drag.scrollTop - dy;
      event.preventDefault();
    });

    function stopDrag(event) {
      if (!state.drag || event.pointerId !== state.drag.pointerId) {
        return;
      }
      if (typeof viewport.releasePointerCapture === 'function') {
        try {
          viewport.releasePointerCapture(event.pointerId);
        } catch {
          // 指针已被浏览器释放时无需处理。
        }
      }
      state.ignoreCanvasClick = state.drag.didMove;
      state.drag = null;
      viewport.style.cursor = 'default';
    }
    viewport.addEventListener('pointerup', stopDrag);
    viewport.addEventListener('pointercancel', stopDrag);

    const onResize = () => {
      if (!image.hidden && image.naturalWidth && image.naturalHeight) {
        layoutImage(true);
      }
    };
    window.addEventListener('resize', onResize);
    state.cleanup = () => window.removeEventListener('resize', onResize);

    canvas.appendChild(image);
    canvas.appendChild(placeholder);
    viewport.appendChild(canvas);
    overlay.appendChild(viewport);
    overlay.appendChild(closeButton);
    overlay.appendChild(previousButton);
    overlay.appendChild(nextButton);
    overlay.appendChild(status);
    overlay.appendChild(counter);
    document.body.appendChild(overlay);
    activeFrames.set(overlay, state);

    renderCurrent();
    // 只有明确总图数 > 3 才加载详情页；1~3 图帖子完全不触发。
    if (state.needsRemote) startRemoteFetch('background');
    return true;
  }

  function openComments(postUrl) {
    const frameUrl = nativeInteractions.makeFrameUrl(postUrl, 'comments', window.location.origin);
    if (!frameUrl || !document.body) {
      return false;
    }

    ensureOverlayStyles();
    const overlay = document.createElement('div');
    const dialog = document.createElement('div');
    const closeButton = document.createElement('button');
    const loading = document.createElement('div');
    const frame = document.createElement('iframe');
    const state = {
      cleanup: null,
      frame,
      overlay,
      statusTimer: null,
      timeoutId: null,
      type: 'comments',
    };

    overlay.className = 'xhh-native-comments-overlay';
    dialog.className = 'xhh-native-comments-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', '帖子评论');
    closeButton.type = 'button';
    closeButton.textContent = '关闭';
    loading.className = 'xhh-native-comments-loading';
    loading.textContent = '正在加载评论区…';
    frame.className = 'xhh-native-comments-frame';
    frame.src = frameUrl;
    frame.setAttribute('allow', "autoplay 'none'");
    frame.setAttribute('title', '帖子评论');

    closeButton.addEventListener('click', () => removeFrameState(state));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        removeFrameState(state);
      }
    });

    dialog.appendChild(closeButton);
    dialog.appendChild(loading);
    dialog.appendChild(frame);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    activeFrames.set(frame, state);
    state.loading = loading;
    state.timeoutId = globalThis.setTimeout(() => {
      state.timeoutId = null;
      loading.textContent = '评论区加载失败，请关闭后重试。';
    }, 12000);
    return true;
  }

  function stateForMessage(event) {
    for (const state of activeFrames.values()) {
      if (!state.frame || event.source !== state.frame.contentWindow) {
        continue;
      }
      const sourcePostUrl = state.frame.src.split('#')[0];
      if (event.data.postUrl === sourcePostUrl) {
        return state;
      }
    }
    return null;
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && event.origin === window.location.origin) {
      const bridgeData = event.data;
      if (bridgeData && bridgeData.source === FEED_BRIDGE_SOURCE && bridgeData.type === 'feed-images') {
        const linkId = String(bridgeData.linkId || '').trim();
        const urls = Array.isArray(bridgeData.urls)
          ? bridgeData.urls.map(normalizeImageUrl)
          : [];
        const totalCount = Math.max(Number(bridgeData.totalCount) || 0, urls.length);
        if (/^\d+$/.test(linkId) && totalCount > 0) {
          const previous = feedImageCache.get(linkId) || { totalCount: 0, urls: [] };
          const mergedTotalCount = Math.max(previous.totalCount, totalCount);
          const mergedUrls = mergeImageLists(previous.urls, urls, mergedTotalCount);
          feedImageCache.set(linkId, { totalCount: mergedTotalCount, urls: mergedUrls });
          const behavior = settingsGate.getBehavior();
          for (const candidate of activeFrames.values()) {
            if (candidate.type !== 'gallery' || candidate.postId !== linkId) continue;
            candidate.needsRemote = behavior.multiImageCompletion && mergedTotalCount > 3;
            if (!candidate.needsRemote) continue;
            if (mergedTotalCount > candidate.totalCount) {
              const oldLength = candidate.urls.length;
              candidate.urls.length = mergedTotalCount;
              for (let i = oldLength; i < mergedTotalCount; i += 1) candidate.urls[i] = '';
              candidate.totalCount = mergedTotalCount;
            }
            if (mergedUrls.length > candidate.localUrls.length && typeof candidate.acceptRemoteUrls === 'function') {
              candidate.acceptRemoteUrls(mergedUrls);
            }
          }
        }
        return;
      }
    }

    if (!nativeInteractions.isSiteOrigin(event.origin) || !nativeInteractions.isFrameMessage(event.data)) {
      return;
    }

    const state = stateForMessage(event);
    if (!state) {
      return;
    }

    if (event.data.type === 'xhh-native:frame-error') {
      if (state.loading) {
        state.loading.textContent = '评论区加载失败，请关闭后重试。';
      }
      return;
    }

    if (state.type === 'comments' && event.data.type === 'xhh-native:comments-ready') {
      if (state.timeoutId !== null) {
        globalThis.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      if (state.loading) {
        state.loading.remove();
      }
      state.frame.style.opacity = '1';
      state.frame.style.pointerEvents = 'auto';
      return;
    }


  });

  document.addEventListener('keydown', (event) => {
    const states = [...activeFrames.values()];
    const gallery = [...states].reverse().find((state) => state.type === 'gallery' && state.overlay && state.overlay.isConnected);
    if (gallery) {
      if (event.key === 'Escape') {
        removeFrameState(gallery);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowLeft' && gallery.urls.length > 0 && gallery.index > 0) {
        gallery.previousButton.click();
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight' && gallery.totalCount > 0 && gallery.index < gallery.totalCount - 1) {
        gallery.nextButton.click();
        event.preventDefault();
        return;
      }
    }

    if (event.key !== 'Escape') {
      return;
    }
    for (let index = states.length - 1; index >= 0; index -= 1) {
      if (states[index].overlay) {
        removeFrameState(states[index]);
        return;
      }
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const behavior = settingsGate.getBehavior();
    if (!behavior.enabled) return;

    const link = target.closest('a[href]');
    const shouldEnhancePost = link && decision.shouldEnhancePost({ href: link.href });
    if (!shouldEnhancePost) {
      return;
    }

    const imageTile = target.closest(imageSelector);
    if (behavior.imageViewer && imageTile && isPlainPrimaryClick(event)) {
      const siblings = imageTile.parentElement && typeof imageTile.parentElement.querySelectorAll === 'function'
        ? [...imageTile.parentElement.querySelectorAll(':scope > .bbs-content__image')]
        : [];
      const initialIndex = Math.max(siblings.indexOf(imageTile), 0);
      if (openGallery(link.href, initialIndex, imageTile, link)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const commentAction = target.closest(commentSelector);
    if (behavior.commentsPopup && commentAction && isPlainPrimaryClick(event)) {
      if (openComments(link.href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }


    const shouldOpen = decision.shouldOpenPost({
      pathname: window.location.pathname,
      href: link.href,
      button: event.button,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      excludedTarget: Boolean(target.closest(excludedSelector))
        || Boolean(target.closest(nativeControlSelector)),
    });

    if (!behavior.openPosts || !shouldOpen) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({
      type: 'open-post',
      url: link.href,
      openMode: behavior.openInBackground ? 'background' : 'foreground',
      returnToSource: behavior.returnToSource,
    });
  }, true);
})();
