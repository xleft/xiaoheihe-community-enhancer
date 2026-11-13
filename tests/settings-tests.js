'use strict';

const assert = require('node:assert/strict');

let settings = null;
try {
  settings = require('../src/settings.js');
} catch {
  // RED: 0.6.1 还没有设置模块。
}

assert.ok(settings, 'settings module must exist');

const defaults = {
  enabled: true,
  openMode: 'foreground',
  returnToSource: true,
  imageViewer: true,
  multiImageCompletion: true,
  commentMode: 'popup',
};

assert.deepEqual(settings.DEFAULT_SETTINGS, defaults);
assert.deepEqual(settings.normalizeSettings({}), defaults);
assert.deepEqual(settings.normalizeSettings({
  enabled: false,
  openMode: 'background',
  returnToSource: false,
  imageViewer: false,
  multiImageCompletion: false,
  commentMode: 'native',
}), {
  enabled: false,
  openMode: 'background',
  returnToSource: false,
  imageViewer: false,
  multiImageCompletion: false,
  commentMode: 'native',
});

assert.deepEqual(settings.normalizeSettings({
  enabled: 'yes',
  openMode: 'window',
  returnToSource: 1,
  imageViewer: null,
  multiImageCompletion: 'no',
  commentMode: 'drawer',
}), defaults);

assert.deepEqual(settings.getEffectiveBehavior(defaults), {
  enabled: true,
  openPosts: true,
  openInBackground: false,
  returnToSource: true,
  imageViewer: true,
  multiImageCompletion: true,
  commentsPopup: true,
});

assert.deepEqual(settings.getEffectiveBehavior({
  ...defaults,
  openMode: 'native',
  imageViewer: false,
}), {
  enabled: true,
  openPosts: false,
  openInBackground: false,
  returnToSource: false,
  imageViewer: false,
  multiImageCompletion: false,
  commentsPopup: true,
});

assert.deepEqual(settings.getEffectiveBehavior({ ...defaults, enabled: false }), {
  enabled: false,
  openPosts: false,
  openInBackground: false,
  returnToSource: false,
  imageViewer: false,
  multiImageCompletion: false,
  commentsPopup: false,
});

const settingsGate = settings.createSettingsGate();
assert.equal(settingsGate.isReady(), false);
assert.deepEqual(settingsGate.getBehavior(), {
  enabled: false,
  openPosts: false,
  openInBackground: false,
  returnToSource: false,
  imageViewer: false,
  multiImageCompletion: false,
  commentsPopup: false,
});
settingsGate.apply({ ...defaults, openMode: 'background' });
assert.equal(settingsGate.isReady(), true);
assert.equal(settingsGate.getBehavior().openInBackground, true);

assert.deepEqual(settings.getPanelState(defaults), {
  paused: false,
  returnDisabled: false,
  viewerDisabled: false,
  multiDisabled: false,
  commentsDisabled: false,
});
assert.deepEqual(settings.getPanelState({ ...defaults, openMode: 'native', imageViewer: false }), {
  paused: false,
  returnDisabled: true,
  viewerDisabled: false,
  multiDisabled: true,
  commentsDisabled: false,
});

function createStorage(initialValue) {
  let value = initialValue;
  return {
    get(key, callback) {
      callback({ [key]: value });
    },
    set(payload, callback) {
      value = payload[settings.STORAGE_KEY];
      callback();
    },
    snapshot() {
      return value;
    },
  };
}

(async () => {
  const storage = createStorage({ openMode: 'background', imageViewer: false });
  assert.deepEqual(await settings.loadSettings(storage), {
    ...defaults,
    openMode: 'background',
    imageViewer: false,
  });

  const saved = await settings.saveSettings(storage, {
    ...defaults,
    commentMode: 'native',
  });
  assert.equal(saved.commentMode, 'native');
  assert.deepEqual(storage.snapshot(), saved);

  const persistedModes = [];
  const visibleModes = [];
  const queueSave = settings.createSerialSaver(
    async (value) => {
      persistedModes.push(value.openMode);
      return value;
    },
    (value) => visibleModes.push(value.openMode),
  );
  await Promise.all([
    queueSave({ ...defaults, openMode: 'foreground' }),
    queueSave({ ...defaults, openMode: 'background' }),
  ]);
  assert.deepEqual(persistedModes, ['foreground', 'background']);
  assert.deepEqual(visibleModes, ['background']);

  const listeners = new Set();
  const changeEvent = {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
  };
  let observed = null;
  const unsubscribe = settings.subscribeToSettings(changeEvent, (next) => { observed = next; });
  for (const listener of listeners) {
    listener({
      [settings.STORAGE_KEY]: { newValue: { enabled: false, openMode: 'background' } },
    }, 'local');
  }
  assert.deepEqual(observed, {
    ...defaults,
    enabled: false,
    openMode: 'background',
  });
  unsubscribe();
  assert.equal(listeners.size, 0);

  console.log('settings-tests: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
