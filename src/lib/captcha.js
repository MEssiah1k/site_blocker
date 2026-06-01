import {
  MIN_REQUEST_MINUTES,
  CAPTCHA_L1_MIN_LENGTH,
  CAPTCHA_L1_MAX_LENGTH,
  CAPTCHA_L1_MAX_MINUTES,
  CAPTCHA_L2_MIN_LENGTH,
  CAPTCHA_L2_MAX_LENGTH,
  CAPTCHA_L2_MAX_MINUTES,
  CAPTCHA_UPPER,
  CAPTCHA_LOWER,
  CAPTCHA_DIGITS,
  CAPTCHA_SYMBOLS,
  CAPTCHA_ALL,
} from './constants.js';

const RULE_CAPTCHA_CHARS = CAPTCHA_UPPER + CAPTCHA_LOWER;
const RULE_CAPTCHA_LENGTH = 10;

export function calculateCaptchaLength(level, minutes) {
  if (minutes < MIN_REQUEST_MINUTES) {
    throw new Error(`分钟数必须 >= ${MIN_REQUEST_MINUTES}`);
  }
  if (level === 1) {
    if (minutes > CAPTCHA_L1_MAX_MINUTES) {
      throw new Error(`Level 1 最长可申请 ${CAPTCHA_L1_MAX_MINUTES} 分钟`);
    }
    const slope = (CAPTCHA_L1_MAX_LENGTH - CAPTCHA_L1_MIN_LENGTH) / (CAPTCHA_L1_MAX_MINUTES - MIN_REQUEST_MINUTES);
    const length = Math.ceil(CAPTCHA_L1_MIN_LENGTH + slope * (minutes - MIN_REQUEST_MINUTES));
    return Math.min(length, CAPTCHA_L1_MAX_LENGTH);
  }
  if (level === 2) {
    if (minutes > CAPTCHA_L2_MAX_MINUTES) {
      throw new Error(`Level 2 最长可申请 ${CAPTCHA_L2_MAX_MINUTES} 分钟`);
    }
    const slope = (CAPTCHA_L2_MAX_LENGTH - CAPTCHA_L2_MIN_LENGTH) / (CAPTCHA_L2_MAX_MINUTES - MIN_REQUEST_MINUTES);
    const length = Math.ceil(CAPTCHA_L2_MIN_LENGTH + slope * (minutes - MIN_REQUEST_MINUTES));
    return Math.min(length, CAPTCHA_L2_MAX_LENGTH);
  }
  throw new Error('该等级不支持验证码');
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

export function generateCaptcha(length) {
  if (length < 4) {
    throw new Error('验证码长度必须 >= 4');
  }

  const chars = [
    randomChar(CAPTCHA_UPPER),
    randomChar(CAPTCHA_LOWER),
    randomChar(CAPTCHA_DIGITS),
    randomChar(CAPTCHA_SYMBOLS),
  ];

  while (chars.length < length) {
    chars.push(randomChar(CAPTCHA_ALL));
  }

  return shuffle(chars).join('');
}

export function generateRuleCaptcha() {
  const chars = [];
  // Ensure at least 1 uppercase and 1 lowercase
  chars.push(randomChar(CAPTCHA_UPPER));
  chars.push(randomChar(CAPTCHA_LOWER));

  while (chars.length < RULE_CAPTCHA_LENGTH) {
    chars.push(randomChar(RULE_CAPTCHA_CHARS));
  }

  return shuffle(chars).join('');
}

export function transformRuleCaptcha(captcha) {
  let result = '';
  for (const c of captcha) {
    // Swap case
    const swapped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    // Shift +2 in alphabet (circular)
    const isUpper = swapped >= 'A' && swapped <= 'Z';
    const base = isUpper ? 65 : 97;
    const code = swapped.charCodeAt(0) - base;
    const shifted = (code + 2) % 26;
    result += String.fromCharCode(base + shifted);
  }
  return result;
}
