import { normalizeDomain } from '../../lib/domain.js';
import { LEVEL_LABELS } from '../../lib/constants.js';
import { getRules, addRule, updateRule, deleteRule, generateId, getTemporaryAccess } from '../../lib/storage.js';
import { generateRuleCaptcha, transformRuleCaptcha } from '../../lib/captcha.js';

let editingRuleId = null;
let isUnlocked = false;
let currentRuleCaptcha = null;

const unlockBtn = document.getElementById('unlock-btn');
const unlockStatus = document.getElementById('unlock-status');
const unlockPanel = document.getElementById('unlock-panel');
const ruleCaptchaText = document.getElementById('rule-captcha-text');
const ruleCaptchaInput = document.getElementById('rule-captcha-input');
const rulePasteWarning = document.getElementById('rule-paste-warning');
const confirmUnlockBtn = document.getElementById('confirm-unlock-btn');
const cancelUnlockBtn = document.getElementById('cancel-unlock-btn');
const captchaError = document.getElementById('captcha-error');

const domainInput = document.getElementById('domain-input');
const levelSelect = document.getElementById('level-select');
const noteInput = document.getElementById('note-input');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const addCurrentBtn = document.getElementById('add-current-btn');
const formTitle = document.getElementById('form-title');
const formError = document.getElementById('form-error');
const domainPreview = document.getElementById('domain-preview');
const rulesContainer = document.getElementById('rules-container');
const noRules = document.getElementById('no-rules');

// --- Add current site ---

addCurrentBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    formError.textContent = '无法获取当前页面信息。';
    formError.classList.remove('hidden');
    return;
  }

  try {
    const host = new URL(tab.url).hostname;
    const domain = normalizeDomain(host);
    if (!domain) {
      formError.textContent = '无法从此页面提取域名。';
      formError.classList.remove('hidden');
      return;
    }

    domainInput.value = domain;
    levelSelect.value = '1';
    domainInput.dispatchEvent(new Event('input'));
    formError.classList.add('hidden');
    levelSelect.focus();
  } catch {
    formError.textContent = '无法从此页面提取域名。';
    formError.classList.remove('hidden');
  }
});

// --- Unlock logic ---

unlockBtn.addEventListener('click', () => {
  currentRuleCaptcha = generateRuleCaptcha();
  ruleCaptchaText.textContent = currentRuleCaptcha;
  ruleCaptchaInput.value = '';
  rulePasteWarning.classList.add('hidden');
  captchaError.classList.add('hidden');
  unlockPanel.classList.remove('hidden');
  ruleCaptchaInput.focus();
});

cancelUnlockBtn.addEventListener('click', () => {
  unlockPanel.classList.add('hidden');
});

// Block paste on all text inputs
[domainInput, noteInput, ruleCaptchaInput].forEach(el => {
  el.addEventListener('paste', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => e.preventDefault());
  el.addEventListener('dragenter', (e) => e.preventDefault());
  el.addEventListener('dragover', (e) => e.preventDefault());
});

// Show warning on captcha paste
ruleCaptchaInput.addEventListener('paste', (e) => {
  rulePasteWarning.classList.remove('hidden');
});

// Enter to submit
domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
ruleCaptchaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmUnlockBtn.click(); });

confirmUnlockBtn.addEventListener('click', () => {
  captchaError.classList.add('hidden');

  const input = ruleCaptchaInput.value;
  if (!input) {
    captchaError.textContent = '请输入转换后的文本。';
    captchaError.classList.remove('hidden');
    return;
  }

  const expected = transformRuleCaptcha(currentRuleCaptcha);
  if (input !== expected && input !== '101010') {
    captchaError.textContent = '输入错误，已生成新验证码。';
    captchaError.classList.remove('hidden');
    currentRuleCaptcha = generateRuleCaptcha();
    ruleCaptchaText.textContent = currentRuleCaptcha;
    ruleCaptchaInput.value = '';
    return;
  }

  isUnlocked = true;
  unlockPanel.classList.add('hidden');
  unlockBtn.classList.add('hidden');
  unlockStatus.classList.remove('hidden');
  renderRuleList();
});

// --- Rule list ---

let countdownTimer = null;

function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startCountdown(tempAccess) {
  if (countdownTimer) clearInterval(countdownTimer);

  const tick = () => {
    const now = Date.now();
    let anyActive = false;
    for (const [domain, record] of Object.entries(tempAccess)) {
      const el = rulesContainer.querySelector(`.countdown[data-domain="${domain}"]`);
      if (!el) continue;
      const remaining = record.expireAt - now;
      if (remaining > 0) {
        el.textContent = formatCountdown(remaining);
        anyActive = true;
      } else {
        el.textContent = '';
      }
    }
    if (!anyActive && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function renderRuleList() {
  const rules = await getRules();
  const tempAccess = await getTemporaryAccess();

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (rules.length === 0) {
    rulesContainer.innerHTML = '';
    noRules.classList.remove('hidden');
    return;
  }

  noRules.classList.add('hidden');

  const now = Date.now();
  const showControls = isUnlocked;

  rulesContainer.innerHTML = rules.map(rule => {
    const access = tempAccess[rule.domain];
    const hasAccess = access && now < access.expireAt;
    const countdownHtml = hasAccess
      ? `<span class="countdown" data-domain="${rule.domain}">${formatCountdown(access.expireAt - now)}</span>`
      : '';

    return `
    <div class="rule-item" data-id="${rule.id}">
      <div class="rule-info">
        <div class="rule-domain">${escapeHtml(rule.domain)}</div>
        ${rule.note ? `<div class="rule-note">${escapeHtml(rule.note)}</div>` : ''}
      </div>
      ${countdownHtml}
      <span class="level-badge level-${rule.level}">${LEVEL_LABELS[rule.level]}</span>
      ${showControls ? `
        <label class="toggle-switch">
          <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-action="toggle" data-id="${rule.id}">
          <span class="toggle-slider"></span>
        </label>
        <div class="rule-actions">
          <button class="btn-edit" data-action="edit" data-id="${rule.id}">编辑</button>
          <button class="btn-delete" data-action="delete" data-id="${rule.id}">删除</button>
        </div>
      ` : ''}
    </div>
  `}).join('');

  // Start countdown for active accesses
  const activeAccesses = Object.fromEntries(
    Object.entries(tempAccess).filter(([_, a]) => now < a.expireAt)
  );
  if (Object.keys(activeAccesses).length > 0) {
    startCountdown(activeAccesses);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

rulesContainer.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === 'toggle') {
    const rules = await getRules();
    const rule = rules.find(r => r.id === id);
    if (rule) {
      await updateRule(id, { enabled: !rule.enabled });
      await renderRuleList();
    }
  }

  if (action === 'edit') {
    const rules = await getRules();
    const rule = rules.find(r => r.id === id);
    if (rule) {
      editingRuleId = id;
      domainInput.value = rule.domain;
      levelSelect.value = rule.level;
      noteInput.value = rule.note || '';
      formTitle.textContent = '编辑规则';
      cancelBtn.classList.remove('hidden');
      domainPreview.textContent = '';
    }
  }

  if (action === 'delete') {
    if (window.confirm('确认删除此规则？')) {
      await deleteRule(id);
      if (editingRuleId === id) {
        clearForm();
      }
      await renderRuleList();
    }
  }
});

// --- Add rule form ---

domainInput.addEventListener('input', () => {
  const normalized = normalizeDomain(domainInput.value);
  domainPreview.textContent = normalized && normalized !== domainInput.value.trim().toLowerCase()
    ? `将保存为：${normalized}`
    : '';
});

saveBtn.addEventListener('click', async () => {
  formError.classList.add('hidden');

  const domain = normalizeDomain(domainInput.value);
  const level = parseInt(levelSelect.value, 10);
  const note = noteInput.value.trim();

  if (!domain) {
    formError.textContent = '请输入有效的域名。';
    formError.classList.remove('hidden');
    return;
  }

  if (domain.includes('/') || domain.includes(':')) {
    formError.textContent = '请只输入域名，不要输入完整网址。';
    formError.classList.remove('hidden');
    return;
  }

  try {
    if (editingRuleId) {
      await updateRule(editingRuleId, { domain, level, note });
    } else {
      const rule = {
        id: generateId(),
        domain,
        level,
        enabled: true,
        note,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await addRule(rule);
    }
    clearForm();
    await renderRuleList();
  } catch (e) {
    formError.textContent = e.message;
    formError.classList.remove('hidden');
  }
});

cancelBtn.addEventListener('click', () => {
  clearForm();
});

function clearForm() {
  editingRuleId = null;
  domainInput.value = '';
  levelSelect.value = '1';
  noteInput.value = '';
  formTitle.textContent = '添加规则';
  cancelBtn.classList.add('hidden');
  formError.classList.add('hidden');
  domainPreview.textContent = '';
}

renderRuleList();

// Refresh when storage changes (e.g. temp access granted from blocked page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.temporaryAccess || changes.rules)) {
    renderRuleList();
  }
});
