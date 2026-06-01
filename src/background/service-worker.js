import { BLOCKED_PAGE_PATH, STORAGE_KEYS } from '../lib/constants.js';
import { extractHost } from '../lib/domain.js';
import { shouldBlock, cleanupExpiredAccess } from '../lib/rule-engine.js';
import { getRules, getTemporaryAccess, initializeStorage, removeTemporaryAccess } from '../lib/storage.js';

const NAVIGATION_FILTER = {
  url: [{ urlPrefix: 'http://' }, { urlPrefix: 'https://' }]
};

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url;
  const host = extractHost(url);
  if (!host) return;

  const rules = await getRules();
  const tempAccess = await getTemporaryAccess();
  const now = Date.now();

  const result = shouldBlock(host, rules, tempAccess, now);

  if (result.blocked) {
    const blockedUrl = chrome.runtime.getURL(BLOCKED_PAGE_PATH) +
      '?target=' + encodeURIComponent(url) +
      '&domain=' + encodeURIComponent(result.rule.domain);

    chrome.tabs.update(details.tabId, { url: blockedUrl });
  }
}, NAVIGATION_FILTER);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'accessGranted') {
    const { domain, expireAt } = message;
    chrome.alarms.create('expire_' + domain, { when: expireAt });
    sendResponse({ ok: true });
  }
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('expire_')) return;

  const domain = alarm.name.substring(7);

  // Clean up expired access
  await removeTemporaryAccess(domain);

  // Find and reload tabs matching the domain
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    const host = extractHost(tab.url);
    if (host && (host === domain || host.endsWith('.' + domain))) {
      chrome.tabs.reload(tab.id);
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
});

chrome.runtime.onStartup.addListener(async () => {
  const tempAccess = await getTemporaryAccess();
  const cleaned = cleanupExpiredAccess(tempAccess, Date.now());
  await new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEYS.TEMPORARY_ACCESS]: cleaned }, resolve);
  });

  // Re-register alarms for any still-valid temp access
  const now = Date.now();
  for (const [domain, record] of Object.entries(cleaned)) {
    if (now < record.expireAt) {
      chrome.alarms.create('expire_' + domain, { when: record.expireAt });
    }
  }
});
