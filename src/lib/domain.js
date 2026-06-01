export function normalizeDomain(input) {
  if (typeof input !== 'string') return '';

  let domain = input.trim().toLowerCase();

  // Strip protocol
  domain = domain.replace(/^https?:\/\//, '');

  // Strip www. prefix
  domain = domain.replace(/^www\./, '');

  // Strip path and trailing slash
  const slashIndex = domain.indexOf('/');
  if (slashIndex !== -1) {
    domain = domain.substring(0, slashIndex);
  }

  // Strip port
  const colonIndex = domain.lastIndexOf(':');
  if (colonIndex !== -1) {
    domain = domain.substring(0, colonIndex);
  }

  // Strip trailing dot
  domain = domain.replace(/\.$/, '');

  return domain;
}

export function isDomainMatched(host, ruleDomain) {
  return host === ruleDomain || host.endsWith('.' + ruleDomain);
}

export function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
