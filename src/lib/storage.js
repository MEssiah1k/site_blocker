import { STORAGE_KEYS, DEFAULT_MAX_REQUEST_MINUTES, CAPTCHA_L1_MAX_LENGTH } from './constants.js';

function generateId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(random, b => b.toString(16).padStart(2, '0')).join('');
  return `rule_${timestamp}_${suffix}`;
}

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

// --- Rules ---

export async function getRules() {
  const rules = await storageGet(STORAGE_KEYS.RULES);
  return Array.isArray(rules) ? rules : [];
}

export async function saveRules(rules) {
  await storageSet({ [STORAGE_KEYS.RULES]: rules });
}

export async function addRule(rule) {
  const rules = await getRules();
  const existing = rules.find(r => r.domain === rule.domain);
  if (existing) {
    throw new Error('该域名已存在');
  }
  rules.push(rule);
  await saveRules(rules);
}

export async function updateRule(id, updates) {
  const rules = await getRules();
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) {
    throw new Error('规则不存在');
  }
  if (updates.domain !== undefined && updates.domain !== rules[index].domain) {
    const duplicate = rules.find(r => r.domain === updates.domain && r.id !== id);
    if (duplicate) {
      throw new Error('该域名已存在');
    }
    // Move temp access to new domain
    const tempAccess = await getTemporaryAccess();
    const oldDomain = rules[index].domain;
    if (tempAccess[oldDomain]) {
      tempAccess[updates.domain] = tempAccess[oldDomain];
      delete tempAccess[oldDomain];
      await storageSet({ [STORAGE_KEYS.TEMPORARY_ACCESS]: tempAccess });
    }
  }
  rules[index] = { ...rules[index], ...updates, updatedAt: Date.now() };
  await saveRules(rules);
}

export async function deleteRule(id) {
  const rules = await getRules();
  const rule = rules.find(r => r.id === id);
  if (!rule) return;

  // Remove temp access for this domain
  await removeTemporaryAccess(rule.domain);

  const filtered = rules.filter(r => r.id !== id);
  await saveRules(filtered);
}

export { generateId };

// --- Temporary Access ---

export async function getTemporaryAccess() {
  const access = await storageGet(STORAGE_KEYS.TEMPORARY_ACCESS);
  return access && typeof access === 'object' ? access : {};
}

export async function getTemporaryAccessForDomain(domain) {
  const access = await getTemporaryAccess();
  return access[domain] || null;
}

export async function setTemporaryAccess(domain, record) {
  const access = await getTemporaryAccess();
  access[domain] = record;
  await storageSet({ [STORAGE_KEYS.TEMPORARY_ACCESS]: access });
}

export async function removeTemporaryAccess(domain) {
  const access = await getTemporaryAccess();
  delete access[domain];
  await storageSet({ [STORAGE_KEYS.TEMPORARY_ACCESS]: access });
}

// --- Settings ---

export async function getSettings() {
  const settings = await storageGet(STORAGE_KEYS.SETTINGS);
  return {
    maxRequestMinutes: settings?.maxRequestMinutes ?? DEFAULT_MAX_REQUEST_MINUTES,
    maxCaptchaLength: settings?.maxCaptchaLength ?? CAPTCHA_L1_MAX_LENGTH,
  };
}

export async function saveSettings(settings) {
  await storageSet({ [STORAGE_KEYS.SETTINGS]: settings });
}

// --- Initialization ---

export async function initializeStorage() {
  const rules = await storageGet(STORAGE_KEYS.RULES);
  const tempAccess = await storageGet(STORAGE_KEYS.TEMPORARY_ACCESS);
  const settings = await storageGet(STORAGE_KEYS.SETTINGS);

  if (rules === undefined) {
    await storageSet({ [STORAGE_KEYS.RULES]: [] });
  }
  if (tempAccess === undefined) {
    await storageSet({ [STORAGE_KEYS.TEMPORARY_ACCESS]: {} });
  }
  if (settings === undefined) {
    await storageSet({ [STORAGE_KEYS.SETTINGS]: { maxRequestMinutes: DEFAULT_MAX_REQUEST_MINUTES, maxCaptchaLength: CAPTCHA_L1_MAX_LENGTH } });
  }
}
