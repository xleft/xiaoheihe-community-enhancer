importScripts('decision.js', 'settings.js', 'tab-behavior.js');

const ORIGIN_KEY_PREFIX = 'xhh-post-origin:';

function originKey(postTabId) {
  return `${ORIGIN_KEY_PREFIX}${postTabId}`;
}

async function rememberPostTabOrigin(postTabId, sourceTabId, windowId) {
  await chrome.storage.session.set({
    [originKey(postTabId)]: { sourceTabId, windowId },
  });
}

async function takePostTabOrigin(postTabId) {
  const key = originKey(postTabId);
  const stored = await chrome.storage.session.get(key);
  const origin = stored[key] || null;
  if (origin) {
    await chrome.storage.session.remove(key);
  }
  return origin;
}

async function openPostInNewTab(message, sender) {
  const source = sender.tab;
  const settingsApi = globalThis.XiaoheiheSettings;
  const tabBehavior = globalThis.XiaoheiheTabBehavior;
  const savedSettings = await settingsApi.loadSettings(chrome.storage.local);
  const behavior = settingsApi.getEffectiveBehavior(savedSettings);
  if (!behavior.openPosts) {
    return;
  }

  const authoritativeMessage = {
    ...message,
    openMode: behavior.openInBackground ? 'background' : 'foreground',
    returnToSource: behavior.returnToSource,
  };
  const createProperties = tabBehavior.createTabProperties(authoritativeMessage, source);

  const postTab = await chrome.tabs.create(createProperties);
  if (tabBehavior.shouldRememberOrigin(authoritativeMessage, source, postTab)) {
    await rememberPostTabOrigin(postTab.id, source.id, source.windowId);
  }
}

async function returnToSourceTab(closedTabId, removeInfo) {
  if (removeInfo.isWindowClosing) {
    return;
  }

  const origin = await takePostTabOrigin(closedTabId);
  if (!origin) {
    return;
  }

  try {
    const sourceTab = await chrome.tabs.get(origin.sourceTabId);
    if (sourceTab.windowId === removeInfo.windowId) {
      await chrome.tabs.update(origin.sourceTabId, { active: true });
    }
  } catch {
    // 来源列表标签已经不存在时，保持 Chrome 自己的标签选择逻辑。
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'open-post' || !globalThis.XiaoheiheNewTabDecision.isPostUrl(message.url)) {
    return;
  }

  void openPostInNewTab(message, sender).catch(() => {
    // 设置读取失败时不接管点击，避免使用过期或猜测的配置。
  });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void returnToSourceTab(tabId, removeInfo);
});
