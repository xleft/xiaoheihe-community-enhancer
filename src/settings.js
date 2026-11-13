(function exposeSettingsModule(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.XiaoheiheSettings = api;
}(globalThis, function createSettingsModule() {
  'use strict';

  const STORAGE_KEY = 'xhh-community-settings';
  const OPEN_MODES = new Set(['foreground', 'background', 'native']);
  const COMMENT_MODES = new Set(['popup', 'native']);
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    openMode: 'foreground',
    returnToSource: true,
    imageViewer: true,
    multiImageCompletion: true,
    commentMode: 'popup',
  });

  function booleanOrDefault(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function normalizeSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      enabled: booleanOrDefault(source.enabled, DEFAULT_SETTINGS.enabled),
      openMode: OPEN_MODES.has(source.openMode) ? source.openMode : DEFAULT_SETTINGS.openMode,
      returnToSource: booleanOrDefault(source.returnToSource, DEFAULT_SETTINGS.returnToSource),
      imageViewer: booleanOrDefault(source.imageViewer, DEFAULT_SETTINGS.imageViewer),
      multiImageCompletion: booleanOrDefault(
        source.multiImageCompletion,
        DEFAULT_SETTINGS.multiImageCompletion,
      ),
      commentMode: COMMENT_MODES.has(source.commentMode)
        ? source.commentMode
        : DEFAULT_SETTINGS.commentMode,
    };
  }

  function getEffectiveBehavior(value) {
    const settings = normalizeSettings(value);
    const enabled = settings.enabled;
    const openPosts = enabled && settings.openMode !== 'native';
    const imageViewer = enabled && settings.imageViewer;
    return {
      enabled,
      openPosts,
      openInBackground: openPosts && settings.openMode === 'background',
      returnToSource: openPosts && settings.returnToSource,
      imageViewer,
      multiImageCompletion: imageViewer && settings.multiImageCompletion,
      commentsPopup: enabled && settings.commentMode === 'popup',
    };
  }

  function createSettingsGate() {
    let ready = false;
    let settings = normalizeSettings(DEFAULT_SETTINGS);

    return {
      apply(value) {
        settings = normalizeSettings(value);
        ready = true;
        return settings;
      },
      getBehavior() {
        return ready
          ? getEffectiveBehavior(settings)
          : getEffectiveBehavior({ ...DEFAULT_SETTINGS, enabled: false });
      },
      getSettings() {
        return settings;
      },
      isReady() {
        return ready;
      },
    };
  }

  function getPanelState(value) {
    const settings = normalizeSettings(value);
    return {
      paused: !settings.enabled,
      returnDisabled: !settings.enabled || settings.openMode === 'native',
      viewerDisabled: !settings.enabled,
      multiDisabled: !settings.enabled || !settings.imageViewer,
      commentsDisabled: !settings.enabled,
    };
  }

  function currentRuntimeError() {
    return globalThis.chrome?.runtime?.lastError || null;
  }

  function loadSettings(storageArea) {
    return new Promise((resolve, reject) => {
      storageArea.get(STORAGE_KEY, (result) => {
        const error = currentRuntimeError();
        if (error) {
          reject(new Error(error.message || '读取设置失败'));
          return;
        }
        resolve(normalizeSettings(result && result[STORAGE_KEY]));
      });
    });
  }

  function saveSettings(storageArea, value) {
    const normalized = normalizeSettings(value);
    return new Promise((resolve, reject) => {
      storageArea.set({ [STORAGE_KEY]: normalized }, () => {
        const error = currentRuntimeError();
        if (error) {
          reject(new Error(error.message || '保存设置失败'));
          return;
        }
        resolve(normalized);
      });
    });
  }

  function subscribeToSettings(changeEvent, onSettings) {
    const listener = (changes, areaName) => {
      if (areaName !== 'local' || !changes || !changes[STORAGE_KEY]) return;
      onSettings(normalizeSettings(changes[STORAGE_KEY].newValue));
    };
    changeEvent.addListener(listener);
    return () => changeEvent.removeListener(listener);
  }

  function createSerialSaver(saveValue, onLatestSaved = () => {}, onLatestError = () => {}) {
    let chain = Promise.resolve();
    let revision = 0;

    return (value) => {
      const snapshot = normalizeSettings(value);
      const currentRevision = ++revision;
      const task = chain
        .catch(() => {})
        .then(() => saveValue(snapshot));
      chain = task.catch(() => {});

      return task.then((saved) => {
        const normalized = normalizeSettings(saved);
        if (currentRevision === revision) onLatestSaved(normalized);
        return normalized;
      }, (error) => {
        if (currentRevision === revision) onLatestError(error);
        throw error;
      });
    };
  }

  return {
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    createSerialSaver,
    createSettingsGate,
    getEffectiveBehavior,
    getPanelState,
    loadSettings,
    normalizeSettings,
    saveSettings,
    subscribeToSettings,
  };
}));
