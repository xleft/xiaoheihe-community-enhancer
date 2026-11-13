(() => {
  'use strict';

  const settingsApi = globalThis.XiaoheiheSettings;
  const controls = {
    commentMode: document.getElementById('comment-mode'),
    enabled: document.getElementById('enabled'),
    imageViewer: document.getElementById('image-viewer'),
    multiImageCompletion: document.getElementById('multi-image-completion'),
    openMode: document.getElementById('open-mode'),
    reset: document.getElementById('reset-settings'),
    returnToSource: document.getElementById('return-to-source'),
    saveStatus: document.getElementById('save-status'),
    version: document.getElementById('version'),
  };
  let currentSettings = settingsApi.normalizeSettings(settingsApi.DEFAULT_SETTINGS);
  let statusTimer = null;

  function readForm() {
    return settingsApi.normalizeSettings({
      enabled: controls.enabled.checked,
      openMode: controls.openMode.value,
      returnToSource: controls.returnToSource.checked,
      imageViewer: controls.imageViewer.checked,
      multiImageCompletion: controls.multiImageCompletion.checked,
      commentMode: controls.commentMode.value,
    });
  }

  function setDisabled(element, disabled) {
    element.disabled = disabled;
    element.closest('.setting-row')?.classList.toggle('disabled', disabled);
  }

  function render() {
    const panelState = settingsApi.getPanelState(currentSettings);
    controls.enabled.checked = currentSettings.enabled;
    controls.returnToSource.checked = currentSettings.returnToSource;
    controls.imageViewer.checked = currentSettings.imageViewer;
    controls.multiImageCompletion.checked = currentSettings.multiImageCompletion;
    controls.openMode.value = currentSettings.openMode;
    controls.commentMode.value = currentSettings.commentMode;

    setDisabled(controls.openMode, panelState.paused);
    setDisabled(controls.commentMode, panelState.commentsDisabled);
    setDisabled(controls.returnToSource, panelState.returnDisabled);
    setDisabled(controls.imageViewer, panelState.viewerDisabled);
    setDisabled(controls.multiImageCompletion, panelState.multiDisabled);
  }

  function showStatus(message, error = false) {
    if (statusTimer !== null) clearTimeout(statusTimer);
    controls.saveStatus.textContent = message;
    controls.saveStatus.classList.toggle('error', error);
    if (!error && message) {
      statusTimer = setTimeout(() => {
        controls.saveStatus.textContent = '';
        statusTimer = null;
      }, 1600);
    }
  }

  const persistSettings = settingsApi.createSerialSaver(
    (value) => settingsApi.saveSettings(chrome.storage.local, value),
    (saved) => {
      currentSettings = saved;
      render();
      showStatus('已保存，当前页面立即生效');
    },
    () => showStatus('保存失败，请重试', true),
  );

  function queueSave(nextSettings) {
    currentSettings = settingsApi.normalizeSettings(nextSettings);
    render();
    showStatus('正在保存…');
    void persistSettings(currentSettings).catch(() => {});
  }

  function handleChange() {
    queueSave(readForm());
  }

  controls.enabled.addEventListener('change', handleChange);
  controls.returnToSource.addEventListener('change', handleChange);
  controls.imageViewer.addEventListener('change', handleChange);
  controls.multiImageCompletion.addEventListener('change', handleChange);
  controls.openMode.addEventListener('change', handleChange);
  controls.commentMode.addEventListener('change', handleChange);
  controls.reset.addEventListener('click', () => queueSave(settingsApi.DEFAULT_SETTINGS));

  controls.version.textContent = chrome.runtime.getManifest().version;
  settingsApi.loadSettings(chrome.storage.local)
    .then((loaded) => {
      currentSettings = loaded;
      render();
    })
    .catch(() => {
      render();
      showStatus('读取设置失败，正在使用默认设置', true);
    });
})();
