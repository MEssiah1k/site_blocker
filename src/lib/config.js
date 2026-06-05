import { STORAGE_KEYS } from './constants.js';

export const DEFAULT_CONFIG = {
  version: 1,
  minRequestMinutes: 5,
  maxCaptchaLength: 100,
  captchaChars: {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()',
  },
  levels: {
    0: {
      label: '完全禁止',
      allowTempAccess: false,
    },
    1: {
      label: '受控使用',
      allowTempAccess: true,
      maxMinutes: 30,
      captchaFormula: {
        type: 'linear',
        minLength: 20,
        maxLength: 50,
      },
    },
    2: {
      label: '偶尔使用',
      allowTempAccess: true,
      maxMinutes: 120,
      captchaFormula: {
        type: 'stepped',
        baseLength: 5,
        baseMinutes: 5,
        stepMinutes: 10,
        stepLength: 5,
      },
    },
  },
};

let _configCache = null;

function storageGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      resolve(result[key]);
    });
  });
}

function storageSet(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve);
  });
}

function mergeWithDefaults(config) {
  const result = { ...DEFAULT_CONFIG };

  if (config && typeof config === 'object') {
    result.version = typeof config.version === 'number' ? config.version : DEFAULT_CONFIG.version;
    result.minRequestMinutes = typeof config.minRequestMinutes === 'number'
      ? config.minRequestMinutes : DEFAULT_CONFIG.minRequestMinutes;
    result.maxCaptchaLength = typeof config.maxCaptchaLength === 'number'
      ? config.maxCaptchaLength : DEFAULT_CONFIG.maxCaptchaLength;

    if (config.captchaChars && typeof config.captchaChars === 'object') {
      result.captchaChars = { ...DEFAULT_CONFIG.captchaChars, ...config.captchaChars };
    }

    if (config.levels && typeof config.levels === 'object') {
      result.levels = {};
      for (const [key, level] of Object.entries(config.levels)) {
        if (level && typeof level === 'object') {
          result.levels[key] = { ...level };
        }
      }
    }
  }

  return result;
}

export async function loadConfig() {
  const raw = await storageGet(STORAGE_KEYS.CONFIG);
  if (raw === undefined || raw === null) {
    await storageSet({ [STORAGE_KEYS.CONFIG]: DEFAULT_CONFIG });
    _configCache = { ...DEFAULT_CONFIG };
    return _configCache;
  }
  _configCache = mergeWithDefaults(raw);
  return _configCache;
}

export async function getConfig() {
  if (_configCache) {
    return _configCache;
  }
  return loadConfig();
}

export async function saveConfig(config) {
  await storageSet({ [STORAGE_KEYS.CONFIG]: config });
  _configCache = { ...config };
}

export async function getLevelConfig(levelKey) {
  const config = await getConfig();
  const level = config.levels[String(levelKey)];
  if (!level) {
    throw new Error(`Unknown level: ${levelKey}`);
  }
  return level;
}

export async function getMergedCharSet() {
  const config = await getConfig();
  const chars = config.captchaChars;
  return (chars.upper || '') + (chars.lower || '') + (chars.digits || '') + (chars.symbols || '');
}

export function invalidateConfigCache() {
  _configCache = null;
}

// Auto-refresh cache when config changes in storage
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.CONFIG]) {
      const newConfig = changes[STORAGE_KEYS.CONFIG].newValue;
      if (newConfig) {
        _configCache = mergeWithDefaults(newConfig);
      } else {
        _configCache = null;
      }
    }
  });
}
