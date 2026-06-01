export const LEVEL_0 = 0;
export const LEVEL_1 = 1;
export const LEVEL_2 = 2;

export const LEVEL_LABELS = {
  [LEVEL_0]: '完全禁止',
  [LEVEL_1]: '受控使用',
  [LEVEL_2]: '偶尔使用',
};

export const MIN_REQUEST_MINUTES = 5;
export const DEFAULT_MAX_REQUEST_MINUTES = 120;

export const CAPTCHA_L1_MIN_LENGTH = 20;
export const CAPTCHA_L1_MAX_LENGTH = 50;
export const CAPTCHA_L1_MAX_MINUTES = 30;

export const CAPTCHA_L2_MIN_LENGTH = 10;
export const CAPTCHA_L2_MAX_LENGTH = 50;
export const CAPTCHA_L2_MAX_MINUTES = 120;

export const CAPTCHA_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CAPTCHA_LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const CAPTCHA_DIGITS = '0123456789';
export const CAPTCHA_SYMBOLS = '!@#$%^&*()';
export const CAPTCHA_ALL = CAPTCHA_UPPER + CAPTCHA_LOWER + CAPTCHA_DIGITS + CAPTCHA_SYMBOLS;

export const STORAGE_KEYS = {
  RULES: 'rules',
  TEMPORARY_ACCESS: 'temporaryAccess',
  SETTINGS: 'settings',
};

export const BLOCKED_PAGE_PATH = '/src/pages/blocked/blocked.html';
