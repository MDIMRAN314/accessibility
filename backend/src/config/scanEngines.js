const ENGINE_KEYS = {
  IBM_EQUAL_ACCESS: "ibmEqualAccess",
};

const ENGINE_IDS = {
  IBM_EQUAL_ACCESS: "ibm-equal-access",
};

const SCAN_ENGINE_CONFIG = {
  [ENGINE_KEYS.IBM_EQUAL_ACCESS]: {
    id: ENGINE_IDS.IBM_EQUAL_ACCESS,
    defaultEnabled: true,
    available: true,
  },
};

const normalizeEngineOptions = (engineOptions = {}) =>
  Object.fromEntries(
    Object.entries(SCAN_ENGINE_CONFIG).map(([key, config]) => [
      key,
      config.available && engineOptions[key] !== false
        ? Boolean(engineOptions[key] ?? config.defaultEnabled)
        : false,
    ]),
  );

const isEngineEnabled = (engineKey, engineOptions = {}) =>
  Boolean(normalizeEngineOptions(engineOptions)[engineKey]);

module.exports = {
  ENGINE_KEYS,
  ENGINE_IDS,
  SCAN_ENGINE_CONFIG,
  normalizeEngineOptions,
  isEngineEnabled,
};
