(function exposeFrameContent(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  void api.start({
    document,
    interactions: root.XiaoheiheNativeInteractions,
    window,
  });
}(globalThis, function createFrameContent() {
  function getCommentRoots(document) {
    const comments = document.querySelector('.link-comment');
    const reply = document.querySelector('.link-comment__reply');
    return comments && reply ? { comments, reply } : null;
  }

  function waitFor(find, windowObject, timeoutMs = 8000) {
    const found = find();
    if (found) return Promise.resolve(found);

    return new Promise((resolve, reject) => {
      const observer = new windowObject.MutationObserver(() => {
        const value = find();
        if (!value) return;
        observer.disconnect();
        windowObject.clearTimeout(timeoutId);
        resolve(value);
      });
      observer.observe(windowObject.document.documentElement || windowObject.document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      const timeoutId = windowObject.setTimeout(() => {
        observer.disconnect();
        reject(new Error('native-frame-timeout'));
      }, timeoutMs);
    });
  }

  function silenceMedia(document, windowObject) {
    const silence = (media) => {
      if (!media || !/^(VIDEO|AUDIO)$/.test(media.tagName || '')) return;
      media.autoplay = false;
      media.muted = true;
      media.volume = 0;
      if (typeof media.pause === 'function') {
        try { media.pause(); } catch { /* ignore */ }
      }
    };

    const silenceTree = (node) => {
      silence(node);
      if (node && typeof node.querySelectorAll === 'function') {
        for (const media of node.querySelectorAll('video, audio')) silence(media);
      }
    };

    for (const media of document.querySelectorAll('video, audio')) silence(media);
    document.addEventListener('play', (event) => silence(event.target), true);

    if (windowObject.MutationObserver && document.documentElement) {
      const observer = new windowObject.MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) silenceTree(node);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function hideOutsideCommentBranches(document, roots) {
    const retainedRoots = [roots.comments, roots.reply];
    const containsRetainedRoot = (node) => retainedRoots.some((root) => node === root
      || (node && typeof node.contains === 'function' && node.contains(root)));
    const isInsideRetainedRoot = (node) => retainedRoots.some((root) => node === root
      || (root && typeof root.contains === 'function' && root.contains(node)));
    const parents = new Set();

    for (const root of retainedRoots) {
      let current = root.parentElement;
      while (current) {
        if (!isInsideRetainedRoot(current)) parents.add(current);
        if (current === document.body) break;
        current = current.parentElement;
      }
    }

    for (const parent of parents) {
      for (const child of parent.children || []) {
        if (!containsRetainedRoot(child) && child.classList) child.classList.add('xhh-native-frame-hidden');
      }
    }
  }

  function isolateNativeComments(document, roots) {
    if (!document.getElementById('xhh-native-frame-style')) {
      const style = document.createElement('style');
      style.id = 'xhh-native-frame-style';
      style.textContent = `
        .xhh-native-frame-hidden { display: none !important; }
        .link-comment, .link-comment__reply { max-width: none !important; width: 100% !important; }
        .comment__comment-header { position: static !important; top: auto !important; z-index: auto !important; }
        html, body { background: #fff !important; min-height: 100% !important; }
        body { margin: 0 !important; }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    hideOutsideCommentBranches(document, roots);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }

  function send(windowObject, payload, targetOrigin = windowObject.location.origin) {
    windowObject.parent.postMessage(payload, targetOrigin);
  }

  async function start({ document, interactions, window: windowObject }) {
    if (!interactions || windowObject.top === windowObject) return;

    const request = interactions.getFrameRequest(windowObject.location.hash);
    if (!request) return;

    const postUrl = windowObject.location.href.split('#')[0];
    const parentOrigin = request.parentOrigin || windowObject.location.origin;
    try {
      silenceMedia(document, windowObject);

      if (request.mode === 'comments') {
        const roots = await waitFor(() => getCommentRoots(document), windowObject);
        isolateNativeComments(document, roots);
        send(windowObject, { type: 'xhh-native:comments-ready', postUrl }, parentOrigin);
        return;
      }
    } catch (error) {
      send(windowObject, {
        type: 'xhh-native:frame-error',
        postUrl,
        reason: error && error.message ? String(error.message) : 'native-frame-error',
      }, parentOrigin);
    }
  }

  return {
    getCommentRoots,
    hideOutsideCommentBranches,
    isolateNativeComments,
    send,
    silenceMedia,
    start,
    waitFor,
  };
}));
