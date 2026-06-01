import { normalizeDomain } from '../../lib/domain.js';
import { calculateCaptchaLength, generateCaptcha } from '../../lib/captcha.js';
import { getRules, setTemporaryAccess } from '../../lib/storage.js';
import { LEVEL_LABELS, CAPTCHA_L1_MAX_MINUTES, CAPTCHA_L2_MAX_MINUTES } from '../../lib/constants.js';

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('target');
const domainParam = params.get('domain');

let currentCaptcha = null;
let currentRule = null;

const blockedDomainEl = document.getElementById('blocked-domain');
const blockedLevelEl = document.getElementById('blocked-level');
const level0Message = document.getElementById('level0-message');
const applicationForm = document.getElementById('application-form');
const minutesLabel = document.getElementById('minutes-label');
const requestMinutes = document.getElementById('request-minutes');
const captchaPreview = document.getElementById('captcha-preview');
const generateBtn = document.getElementById('generate-captcha-btn');
const captchaSection = document.getElementById('captcha-section');
const captchaText = document.getElementById('captcha-text');
const captchaInput = document.getElementById('captcha-input');
const pasteWarning = document.getElementById('paste-warning');
const submitBtn = document.getElementById('submit-captcha-btn');
const errorMessage = document.getElementById('error-message');
const errorState = document.getElementById('error-state');
const goBackBtn = document.getElementById('go-back-btn');

async function init() {
  if (!targetUrl) {
    showError();
    return;
  }

  const domain = domainParam || extractDomainFromUrl(targetUrl);
  if (!domain) {
    showError();
    return;
  }

  const rules = await getRules();
  currentRule = rules.find(r => r.domain === domain && r.enabled) || null;

  if (!currentRule) {
    showError();
    return;
  }

  blockedDomainEl.textContent = currentRule.domain;
  blockedLevelEl.textContent = LEVEL_LABELS[currentRule.level];
  blockedLevelEl.classList.add(`level-${currentRule.level}`);

  if (currentRule.level === 0) {
    level0Message.classList.remove('hidden');
  } else {
    const maxMin = currentRule.level === 1 ? CAPTCHA_L1_MAX_MINUTES : CAPTCHA_L2_MAX_MINUTES;
    minutesLabel.textContent = `申请时长（分钟，5 ~ ${maxMin}）：`;
    applicationForm.classList.remove('hidden');
    updateCaptchaPreview();
    generateCaptchaForMinutes(5);
  }
}

function extractDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function updateCaptchaPreview() {
  const minutes = parseInt(requestMinutes.value, 10);
  if (isNaN(minutes) || minutes < 5) {
    captchaPreview.textContent = '';
    return;
  }

  const maxMin = currentRule.level === 1 ? CAPTCHA_L1_MAX_MINUTES : CAPTCHA_L2_MAX_MINUTES;
  if (minutes > maxMin) {
    captchaPreview.textContent = `最长可申请 ${maxMin} 分钟。`;
    captchaPreview.classList.add('preview-error');
    return;
  }

  if (isNaN(parseInt(requestMinutes.value, 10))) {
    captchaPreview.textContent = '请输入有效的整数分钟数。';
    captchaPreview.classList.add('preview-error');
    return;
  }

  try {
    const length = calculateCaptchaLength(currentRule.level, minutes);
    captchaPreview.textContent = `需要输入 ${length} 位验证码。`;
    captchaPreview.classList.remove('preview-error');
  } catch (e) {
    captchaPreview.textContent = e.message;
    captchaPreview.classList.add('preview-error');
  }
}

function showError(msg) {
  if (msg) {
    errorState.querySelector('p').textContent = msg;
  }
  errorState.classList.remove('hidden');
  document.getElementById('block-info').classList.add('hidden');
}

function showFormError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove('hidden');
}

function hideFormError() {
  errorMessage.classList.add('hidden');
}

function generateCaptchaForMinutes(minutes) {
  try {
    const length = calculateCaptchaLength(currentRule.level, minutes);
    currentCaptcha = generateCaptcha(length);
    captchaText.textContent = currentCaptcha;
    captchaSection.classList.remove('hidden');
    captchaInput.value = '';
    pasteWarning.classList.add('hidden');
  } catch (e) {
    captchaPreview.textContent = e.message;
    captchaPreview.classList.add('preview-error');
  }
}

requestMinutes.addEventListener('input', updateCaptchaPreview);
requestMinutes.addEventListener('change', tryGenerateCaptcha);

// Enter also generates
requestMinutes.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryGenerateCaptcha(); });

function tryGenerateCaptcha() {
  const raw = requestMinutes.value.trim();
  const minutes = parseInt(raw, 10);

  if (!raw || isNaN(minutes)) {
    captchaPreview.textContent = '请输入有效的整数分钟数。';
    captchaPreview.classList.add('preview-error');
    return;
  }

  if (minutes < 5) {
    captchaPreview.textContent = '请输入至少 5 分钟。';
    captchaPreview.classList.add('preview-error');
    return;
  }

  const maxMin = currentRule.level === 1 ? CAPTCHA_L1_MAX_MINUTES : CAPTCHA_L2_MAX_MINUTES;
  if (minutes > maxMin) {
    captchaPreview.textContent = `最长可申请 ${maxMin} 分钟。`;
    captchaPreview.classList.add('preview-error');
    return;
  }

  captchaPreview.classList.remove('preview-error');
  generateCaptchaForMinutes(minutes);
}

generateBtn.addEventListener('click', () => {
  tryGenerateCaptcha();
});

// Block paste on all inputs
[requestMinutes, captchaInput].forEach(el => {
  el.addEventListener('paste', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => e.preventDefault());
  el.addEventListener('dragenter', (e) => e.preventDefault());
  el.addEventListener('dragover', (e) => e.preventDefault());
});

// Show warning on captcha paste
captchaInput.addEventListener('paste', () => {
  pasteWarning.classList.remove('hidden');
});

// Enter on captcha input submits
captchaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn.click(); });

submitBtn.addEventListener('click', async () => {
  hideFormError();

  if (!currentCaptcha) {
    showFormError('请先生成验证码。');
    return;
  }

  const input = captchaInput.value;
  if (!input) {
    showFormError('请输入验证码。');
    return;
  }

  if (input !== currentCaptcha) {
    showFormError('验证码不匹配，请重试。');
    return;
  }

  const minutes = parseInt(requestMinutes.value, 10);
  const now = Date.now();
  const expireAt = now + minutes * 60 * 1000;

  await setTemporaryAccess(currentRule.domain, {
    startAt: now,
    expireAt,
    grantedAt: now,
  });

  chrome.runtime.sendMessage({ type: 'accessGranted', domain: currentRule.domain, expireAt });

  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    window.location.href = targetUrl;
  }
});

goBackBtn.addEventListener('click', () => {
  window.history.back();
});

init();
