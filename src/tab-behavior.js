(function exposeTabBehaviorModule(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.XiaoheiheTabBehavior = api;
}(globalThis, function createTabBehaviorModule() {
  'use strict';

  function hasSourceTab(source) {
    return Boolean(source
      && Number.isInteger(source.id)
      && Number.isInteger(source.index)
      && Number.isInteger(source.windowId));
  }

  function createTabProperties(message, source) {
    const properties = {
      url: message.url,
      active: message.openMode !== 'background',
    };
    if (hasSourceTab(source)) {
      properties.windowId = source.windowId;
      properties.index = source.index + 1;
      if (message.returnToSource !== false) {
        properties.openerTabId = source.id;
      }
    }
    return properties;
  }

  function shouldRememberOrigin(message, source, postTab) {
    return message.returnToSource !== false
      && hasSourceTab(source)
      && Boolean(postTab && Number.isInteger(postTab.id));
  }

  return {
    createTabProperties,
    hasSourceTab,
    shouldRememberOrigin,
  };
}));
