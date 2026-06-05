import { calculateCaptchaLength, generateCaptcha } from '../../lib/captcha.js';
import { getRules, setTemporaryAccess } from '../../lib/storage.js';
import { getConfig } from '../../lib/config.js';

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('target');
const domainParam = params.get('domain');

let currentCaptcha = null;
let currentRule = null;
let currentConfig = null;

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

function getLevelColor(levelKey) {
  if (currentConfig?.levels[String(levelKey)]?.color) {
    return currentConfig.levels[String(levelKey)].color;
  }
  // Derive a color from level key
  const predefined = { 0: '#c0392b', 1: '#e67e22', 2: '#f1c40f' };
  if (predefined[levelKey]) return predefined[levelKey];
  const hue = (parseInt(levelKey, 10) * 67) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

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

  currentConfig = await getConfig();
  const rules = await getRules();
  currentRule = rules.find(r => r.domain === domain && r.enabled) || null;

  if (!currentRule) {
    showError();
    return;
  }

  const levelConf = currentConfig.levels[String(currentRule.level)];
  if (!levelConf) {
    showError('配置中不存在该等级');
    return;
  }

  blockedDomainEl.textContent = currentRule.domain;
  blockedLevelEl.textContent = levelConf.label;
  blockedLevelEl.style.background = getLevelColor(currentRule.level);
  const isDark = isColorDark(getLevelColor(currentRule.level));
  blockedLevelEl.style.color = isDark ? '#fff' : '#333';

  if (!levelConf.allowTempAccess) {
    level0Message.classList.remove('hidden');
  } else {
    const maxMin = levelConf.maxMinutes;
    minutesLabel.textContent = `申请时长（分钟，${currentConfig.minRequestMinutes} ~ ${maxMin}）：`;
    requestMinutes.min = currentConfig.minRequestMinutes;
    requestMinutes.value = currentConfig.minRequestMinutes;
    applicationForm.classList.remove('hidden');
    updateCaptchaPreview();
    generateCaptchaForMinutes(currentConfig.minRequestMinutes);
  }
}

function isColorDark(color) {
  // Simple check for hex and hsl colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    }
  }
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\(\s*(\d+)/);
    if (match) {
      const hue = parseInt(match[1], 10);
      // Dark for reds, dark for most saturated colors
      return hue < 60 || hue > 300;
    }
  }
  return false;
}

function extractDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function updateCaptchaPreview() {
  if (!currentRule || !currentConfig) return;

  const minutes = parseInt(requestMinutes.value, 10);
  if (isNaN(minutes) || minutes < currentConfig.minRequestMinutes) {
    captchaPreview.textContent = '';
    return;
  }

  const levelConf = currentConfig.levels[String(currentRule.level)];
  if (!levelConf || !levelConf.allowTempAccess) return;

  if (minutes > levelConf.maxMinutes) {
    captchaPreview.textContent = `最长可申请 ${levelConf.maxMinutes} 分钟。`;
    captchaPreview.classList.add('preview-error');
    return;
  }

  calculateCaptchaLength(currentRule.level, minutes).then(length => {
    captchaPreview.textContent = `需要输入 ${length} 位验证码。`;
    captchaPreview.classList.remove('preview-error');
  }).catch(e => {
    captchaPreview.textContent = e.message;
    captchaPreview.classList.add('preview-error');
  });
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

async function generateCaptchaForMinutes(minutes) {
  try {
    const length = await calculateCaptchaLength(currentRule.level, minutes);
    currentCaptcha = await generateCaptcha(length);
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
  if (!currentRule || !currentConfig) return;

  const raw = requestMinutes.value.trim();
  const minutes = parseInt(raw, 10);

  if (!raw || isNaN(minutes)) {
    captchaPreview.textContent = '请输入有效的整数分钟数。';
    captchaPreview.classList.add('preview-error');
    return;
  }

  const levelConf = currentConfig.levels[String(currentRule.level)];
  if (!levelConf) return;

  if (minutes < currentConfig.minRequestMinutes) {
    captchaPreview.textContent = `请输入至少 ${currentConfig.minRequestMinutes} 分钟。`;
    captchaPreview.classList.add('preview-error');
    return;
  }

  if (minutes > levelConf.maxMinutes) {
    captchaPreview.textContent = `最长可申请 ${levelConf.maxMinutes} 分钟。`;
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
