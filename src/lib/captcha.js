import { getConfig, getMergedCharSet } from './config.js';
import { evalFormula } from './expression-evaluator.js';

const RULE_CAPTCHA_LENGTH = 10;

export async function calculateCaptchaLength(levelKey, minutes) {
  const config = await getConfig();
  const levelConf = config.levels[String(levelKey)];

  if (!levelConf) throw new Error(`Unknown level: ${levelKey}`);
  if (!levelConf.allowTempAccess) throw new Error('该等级不支持验证码');
  if (minutes < config.minRequestMinutes) throw new Error(`分钟数必须 >= ${config.minRequestMinutes}`);
  if (minutes > levelConf.maxMinutes) throw new Error(`最长可申请 ${levelConf.maxMinutes} 分钟`);

  const formula = levelConf.captchaFormula;
  let length;

  if (formula.type === 'linear') {
    const range = levelConf.maxMinutes - config.minRequestMinutes;
    if (range <= 0) {
      length = formula.minLength;
    } else {
      const fraction = (minutes - config.minRequestMinutes) / range;
      length = Math.ceil(formula.minLength + (formula.maxLength - formula.minLength) * fraction);
      length = Math.max(formula.minLength, Math.min(formula.maxLength, length));
    }
  } else if (formula.type === 'stepped') {
    if (minutes < formula.baseMinutes) {
      length = formula.baseLength;
    } else {
      length = formula.baseLength + formula.stepLength * Math.floor((minutes - formula.baseMinutes) / formula.stepMinutes);
    }
  } else if (formula.type === 'expression') {
    length = evalFormula(formula.expression, minutes);
  } else {
    throw new Error(`Unknown formula type: ${formula.type}`);
  }

  return Math.max(4, Math.min(config.maxCaptchaLength, length));
}

function cryptoRandomIndex(max) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function randomChar(charset) {
  return charset[cryptoRandomIndex(charset.length)];
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = cryptoRandomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function generateCaptcha(length) {
  if (length < 4) {
    throw new Error('验证码长度必须 >= 4');
  }

  const config = await getConfig();
  const chars = config.captchaChars;
  const all = getMergedCharSet();

  const guaranteed = [];

  // Ensure at least 1 from each non-empty charset
  if (chars.upper && chars.upper.length > 0) guaranteed.push(randomChar(chars.upper));
  if (chars.lower && chars.lower.length > 0) guaranteed.push(randomChar(chars.lower));
  if (chars.digits && chars.digits.length > 0) guaranteed.push(randomChar(chars.digits));
  if (chars.symbols && chars.symbols.length > 0) guaranteed.push(randomChar(chars.symbols));

  // Fill remaining from merged charset
  const mergedChars = await all;
  while (guaranteed.length < length) {
    guaranteed.push(randomChar(mergedChars));
  }

  // Trim if guaranteed slots exceed length (shouldn't happen with length >= 4)
  const trimmed = guaranteed.slice(0, length);

  return shuffle(trimmed).join('');
}

export async function generateRuleCaptcha() {
  const config = await getConfig();
  const upper = config.captchaChars.upper || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = config.captchaChars.lower || 'abcdefghijklmnopqrstuvwxyz';
  const ruleChars = upper + lower;

  const chars = [];
  chars.push(randomChar(upper));
  chars.push(randomChar(lower));

  while (chars.length < RULE_CAPTCHA_LENGTH) {
    chars.push(randomChar(ruleChars));
  }

  return shuffle(chars).join('');
}

export function transformRuleCaptcha(captcha) {
  let result = '';
  for (const c of captcha) {
    const swapped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    const isUpper = swapped >= 'A' && swapped <= 'Z';
    const base = isUpper ? 65 : 97;
    const code = swapped.charCodeAt(0) - base;
    const shifted = (code + 2) % 26;
    result += String.fromCharCode(base + shifted);
  }
  return result;
}
