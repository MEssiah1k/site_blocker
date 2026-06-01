import { isDomainMatched } from './domain.js';

export function findMatchingRule(host, rules) {
  return rules.find(rule => rule.enabled && isDomainMatched(host, rule.domain)) || null;
}

export function isTemporaryAccessValid(record, now) {
  return record !== null && record !== undefined && now < record.expireAt;
}

export function shouldBlock(host, rules, tempAccess, now) {
  const rule = findMatchingRule(host, rules);
  if (!rule) {
    return { blocked: false };
  }

  const access = tempAccess[rule.domain] || null;
  if (isTemporaryAccessValid(access, now)) {
    return { blocked: false, rule, hasValidAccess: true };
  }

  return { blocked: true, rule };
}

export function cleanupExpiredAccess(tempAccess, now) {
  const cleaned = {};
  for (const [domain, record] of Object.entries(tempAccess)) {
    if (now < record.expireAt) {
      cleaned[domain] = record;
    }
  }
  return cleaned;
}
