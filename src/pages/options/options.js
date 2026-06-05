import { getConfig, saveConfig, DEFAULT_CONFIG } from '../../lib/config.js';
import { validateConfig } from '../../lib/config-validator.js';
import { getRules } from '../../lib/storage.js';
import { evalFormula } from '../../lib/expression-evaluator.js';

const configEditor = document.getElementById('config-editor');
const validateBtn = document.getElementById('validate-btn');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const previewBtn = document.getElementById('preview-btn');
const fileInput = document.getElementById('file-input');
const feedback = document.getElementById('feedback');
const previewPanel = document.getElementById('preview-panel');
const previewLevel = document.getElementById('preview-level');
const previewMinutes = document.getElementById('preview-minutes');
const previewCalcBtn = document.getElementById('preview-calc-btn');
const previewResult = document.getElementById('preview-result');
const previewTableContainer = document.getElementById('preview-table-container');

function showFeedback(type, message) {
  feedback.className = type;
  feedback.textContent = message;
  feedback.classList.remove('hidden');
}

function hideFeedback() {
  feedback.classList.add('hidden');
}

function getEditorConfig() {
  try {
    return JSON.parse(configEditor.value);
  } catch (e) {
    return null;
  }
}

function populateEditor(config) {
  configEditor.value = JSON.stringify(config, null, 2);
}

function populatePreviewLevelSelect(config) {
  if (!config || !config.levels) return;

  previewLevel.innerHTML = '';
  const levelKeys = Object.keys(config.levels).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  for (const key of levelKeys) {
    const level = config.levels[key];
    if (level.allowTempAccess) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `等级 ${key} — ${level.label}`;
      previewLevel.appendChild(option);
    }
  }
}

// --- Validate ---

async function doValidate() {
  hideFeedback();

  const raw = configEditor.value.trim();
  if (!raw) {
    showFeedback('error', '配置内容为空。');
    return null;
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    showFeedback('error', `JSON 格式错误：${e.message}`);
    return null;
  }

  const existingRules = await getRules();
  const result = validateConfig(config, existingRules);

  if (!result.valid) {
    let msg = '校验失败：\n';
    for (const err of result.errors) {
      msg += `  ❌ ${err}\n`;
    }
    if (result.warnings.length > 0) {
      msg += '\n警告：\n';
      for (const w of result.warnings) {
        msg += `  ⚠ ${w}\n`;
      }
    }
    showFeedback('error', msg);
    return null;
  }

  if (result.warnings.length > 0) {
    let msg = '校验通过，但有警告：\n';
    for (const w of result.warnings) {
      msg += `  ⚠ ${w}\n`;
    }
    showFeedback('warning', msg);
  } else {
    showFeedback('success', '校验通过！配置格式正确。');
  }

  return config;
}

validateBtn.addEventListener('click', () => {
  doValidate();
});

// --- Save ---

saveBtn.addEventListener('click', async () => {
  const config = await doValidate();
  if (!config) return;

  try {
    await saveConfig(config);
    showFeedback('success', '配置已保存！所有组件将自动更新。');
    populatePreviewLevelSelect(config);
  } catch (e) {
    showFeedback('error', `保存失败：${e.message}`);
  }
});

// --- Reset ---

resetBtn.addEventListener('click', () => {
  if (!window.confirm('确认重置为默认配置？这将替换编辑器中的内容（尚未保存不会生效）。')) {
    return;
  }
  populateEditor(DEFAULT_CONFIG);
  populatePreviewLevelSelect(DEFAULT_CONFIG);
  hideFeedback();
});

// --- Import ---

importBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const config = JSON.parse(reader.result);
      populateEditor(config);
      populatePreviewLevelSelect(config);
      showFeedback('success', `已导入文件：${file.name}。请验证后再保存。`);
    } catch (err) {
      showFeedback('error', `文件内容不是有效的 JSON：${err.message}`);
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
});

// --- Export ---

exportBtn.addEventListener('click', () => {
  const content = configEditor.value;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'site-blocker-config.json';
  a.click();
  URL.revokeObjectURL(url);
});

// --- Preview ---

previewBtn.addEventListener('click', () => {
  previewPanel.classList.toggle('hidden');
  if (!previewPanel.classList.contains('hidden')) {
    const config = getEditorConfig();
    if (config) {
      populatePreviewLevelSelect(config);
    }
  }
});

previewCalcBtn.addEventListener('click', async () => {
  const config = getEditorConfig();
  if (!config) {
    previewResult.textContent = '请先输入有效的配置 JSON。';
    previewResult.style.color = '#e74c3c';
    return;
  }

  const levelKey = previewLevel.value;
  const minutes = parseInt(previewMinutes.value, 10);

  if (!levelKey) {
    previewResult.textContent = '请选择一个等级。';
    previewResult.style.color = '#e74c3c';
    return;
  }

  // Temporarily save config to storage for calculateCaptchaLength to use,
  // then calculate. But we don't want to save the config just for preview.
  // Instead, calculate inline.

  const levelConf = config.levels[String(levelKey)];
  if (!levelConf || !levelConf.allowTempAccess) {
    previewResult.textContent = '该等级不允许临时访问。';
    previewResult.style.color = '#e74c3c';
    previewTableContainer.innerHTML = '';
    return;
  }

  const formula = levelConf.captchaFormula;
  const minReq = config.minRequestMinutes || 5;
  const maxMin = levelConf.maxMinutes;

  function calcLength(T) {
    let length;
    if (formula.type === 'linear') {
      const range = maxMin - minReq;
      if (range <= 0) return formula.minLength;
      const fraction = (T - minReq) / range;
      length = Math.ceil(formula.minLength + (formula.maxLength - formula.minLength) * fraction);
      length = Math.max(formula.minLength, Math.min(formula.maxLength, length));
    } else if (formula.type === 'stepped') {
      if (T < formula.baseMinutes) {
        length = formula.baseLength;
      } else {
        length = formula.baseLength + formula.stepLength * Math.floor((T - formula.baseMinutes) / formula.stepMinutes);
      }
    } else if (formula.type === 'expression') {
      try {
        length = evalFormula(formula.expression, T);
      } catch {
        return '?';
      }
    } else {
      return '?';
    }
    return Math.max(4, Math.min(config.maxCaptchaLength || 100, length));
  }

  if (minutes) {
    const len = calcLength(minutes);
    previewResult.textContent = `等级 ${levelKey}，申请 ${minutes} 分钟 → 验证码长度：${len}`;
    previewResult.style.color = '#2ecc71';
  }

  // Build table
  const step = Math.max(1, Math.floor((maxMin - minReq) / 10));
  let html = '<table><thead><tr><th>申请时长（分钟）</th><th>验证码长度</th></tr></thead><tbody>';
  for (let T = minReq; T <= maxMin; T += step) {
    const len = calcLength(T);
    html += `<tr><td>${T}</td><td class="length">${len}</td></tr>`;
  }
  // Always include the max
  const maxLen = calcLength(maxMin);
  if ((maxMin - minReq) % step !== 0) {
    html += `<tr><td>${maxMin}</td><td class="length">${maxLen}</td></tr>`;
  }
  html += '</tbody></table>';
  previewTableContainer.innerHTML = html;
});

// --- Initialize ---

async function init() {
  const config = await getConfig();
  populateEditor(config);
  populatePreviewLevelSelect(config);
}

init();
