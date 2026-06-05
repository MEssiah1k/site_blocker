import { validateExpression, evalFormula } from './expression-evaluator.js';

function hasDuplicates(str) {
  const seen = new Set();
  for (const ch of str) {
    if (seen.has(ch)) return true;
    seen.add(ch);
  }
  return false;
}

function evaluateFormula(formula, T, minRequestMinutes, maxMinutes) {
  if (formula.type === 'linear') {
    const range = maxMinutes - minRequestMinutes;
    if (range <= 0) return formula.minLength;
    const fraction = (T - minRequestMinutes) / range;
    const length = Math.ceil(formula.minLength + (formula.maxLength - formula.minLength) * fraction);
    return Math.max(formula.minLength, Math.min(formula.maxLength, length));
  }

  if (formula.type === 'stepped') {
    if (T < formula.baseMinutes) return formula.baseLength;
    return formula.baseLength + formula.stepLength * Math.floor((T - formula.baseMinutes) / formula.stepMinutes);
  }

  if (formula.type === 'expression') {
    return evalFormula(formula.expression, T);
  }

  throw new Error(`Unknown formula type: ${formula.type}`);
}

export function validateConfig(config, existingRules) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a JSON object'], warnings: [] };
  }

  // version
  if (typeof config.version !== 'number' || config.version < 1 || !Number.isInteger(config.version)) {
    errors.push('version must be a positive integer');
  }

  // minRequestMinutes
  if (typeof config.minRequestMinutes !== 'number' || !Number.isInteger(config.minRequestMinutes) || config.minRequestMinutes < 1) {
    errors.push('minRequestMinutes must be a positive integer >= 1');
  } else if (config.minRequestMinutes > 1440) {
    warnings.push('minRequestMinutes > 1440 (24 hours) is unusually large');
  }

  // maxCaptchaLength
  if (typeof config.maxCaptchaLength !== 'number' || !Number.isInteger(config.maxCaptchaLength) || config.maxCaptchaLength < 4) {
    errors.push('maxCaptchaLength must be an integer >= 4');
  } else if (config.maxCaptchaLength > 500) {
    errors.push('maxCaptchaLength must be <= 500');
  } else if (config.maxCaptchaLength > 200) {
    warnings.push('maxCaptchaLength > 200 may cause UI issues with very long captchas');
  }

  // captchaChars
  if (!config.captchaChars || typeof config.captchaChars !== 'object') {
    errors.push('captchaChars must be an object with upper, lower, digits, symbols');
  } else {
    for (const key of ['upper', 'lower', 'digits']) {
      const val = config.captchaChars[key];
      if (typeof val !== 'string' || val.length === 0) {
        errors.push(`captchaChars.${key} must be a non-empty string`);
      } else if (hasDuplicates(val)) {
        errors.push(`captchaChars.${key} contains duplicate characters`);
      }
    }

    const symbols = config.captchaChars.symbols;
    if (typeof symbols !== 'string') {
      errors.push('captchaChars.symbols must be a string');
    } else if (symbols.length > 0 && hasDuplicates(symbols)) {
      errors.push('captchaChars.symbols contains duplicate characters');
    }

    // Check total charset has enough characters for captcha
    const total = (config.captchaChars.upper || '').length +
      (config.captchaChars.lower || '').length +
      (config.captchaChars.digits || '').length +
      (config.captchaChars.symbols || '').length;
    if (total < 4) {
      errors.push('Total captcha charset must have at least 4 characters');
    }
  }

  // levels
  if (!config.levels || typeof config.levels !== 'object') {
    errors.push('levels must be an object');
  } else {
    const levelKeys = Object.keys(config.levels);
    if (levelKeys.length === 0) {
      errors.push('levels must have at least one level');
    }

    for (const [key, level] of Object.entries(config.levels)) {
      if (!/^\d+$/.test(key)) {
        errors.push(`Level key "${key}" must be a non-negative integer string`);
        continue;
      }

      if (!level || typeof level !== 'object') {
        errors.push(`Level ${key} must be an object`);
        continue;
      }

      // label
      if (typeof level.label !== 'string' || level.label.length === 0 || level.label.length > 50) {
        errors.push(`Level ${key}: label must be a string (1-50 characters)`);
      }

      // allowTempAccess
      if (typeof level.allowTempAccess !== 'boolean') {
        errors.push(`Level ${key}: allowTempAccess must be a boolean`);
        continue;
      }

      if (level.allowTempAccess) {
        // maxMinutes
        if (typeof level.maxMinutes !== 'number' || !Number.isInteger(level.maxMinutes)) {
          errors.push(`Level ${key}: maxMinutes must be an integer`);
        } else if (level.maxMinutes < (config.minRequestMinutes || 5)) {
          errors.push(`Level ${key}: maxMinutes must be >= minRequestMinutes (${config.minRequestMinutes || 5})`);
        } else if (level.maxMinutes > 1440) {
          warnings.push(`Level ${key}: maxMinutes > 1440 allows more than 24 hours of access`);
        }

        // captchaFormula
        if (!level.captchaFormula || typeof level.captchaFormula !== 'object') {
          errors.push(`Level ${key}: captchaFormula is required when allowTempAccess is true`);
        } else {
          const formula = level.captchaFormula;

          if (!['linear', 'stepped', 'expression'].includes(formula.type)) {
            errors.push(`Level ${key}: captchaFormula.type must be "linear", "stepped", or "expression"`);
          } else {
            if (formula.type === 'linear') {
              if (typeof formula.minLength !== 'number' || !Number.isInteger(formula.minLength) || formula.minLength < 4) {
                errors.push(`Level ${key}: linear formula minLength must be an integer >= 4`);
              }
              if (typeof formula.maxLength !== 'number' || !Number.isInteger(formula.maxLength)) {
                errors.push(`Level ${key}: linear formula maxLength must be an integer`);
              } else if (formula.maxLength < (formula.minLength || 4)) {
                errors.push(`Level ${key}: linear formula maxLength must be >= minLength`);
              }
            }

            if (formula.type === 'stepped') {
              if (typeof formula.baseLength !== 'number' || !Number.isInteger(formula.baseLength) || formula.baseLength < 4) {
                errors.push(`Level ${key}: stepped formula baseLength must be an integer >= 4`);
              }
              if (typeof formula.baseMinutes !== 'number' || !Number.isInteger(formula.baseMinutes) || formula.baseMinutes < 1) {
                errors.push(`Level ${key}: stepped formula baseMinutes must be a positive integer`);
              }
              if (typeof formula.stepMinutes !== 'number' || !Number.isInteger(formula.stepMinutes) || formula.stepMinutes < 1) {
                errors.push(`Level ${key}: stepped formula stepMinutes must be a positive integer`);
              }
              if (typeof formula.stepLength !== 'number' || !Number.isInteger(formula.stepLength) || formula.stepLength < 1) {
                errors.push(`Level ${key}: stepped formula stepLength must be a positive integer`);
              }
            }

            if (formula.type === 'expression') {
              if (typeof formula.expression !== 'string' || formula.expression.length === 0) {
                errors.push(`Level ${key}: expression formula must have a non-empty expression string`);
              } else if (formula.expression.length > 200) {
                errors.push(`Level ${key}: expression must be <= 200 characters`);
              } else {
                const result = validateExpression(formula.expression);
                if (!result.valid) {
                  errors.push(`Level ${key}: invalid expression: ${result.error}`);
                }
              }
            }

            // Test evaluation at boundary points (only if no structural errors for this level)
            const hasLevelErrors = errors.some(e => e.startsWith(`Level ${key}:`));
            if (!hasLevelErrors && level.maxMinutes) {
              const maxCaptcha = config.maxCaptchaLength || 100;
              const minReq = config.minRequestMinutes || 5;
              const testPoints = [minReq, Math.floor((minReq + level.maxMinutes) / 2), level.maxMinutes];

              for (const T of testPoints) {
                try {
                  const length = evaluateFormula(formula, T, minReq, level.maxMinutes);
                  if (!isFinite(length) || length < 0) {
                    errors.push(`Level ${key}: formula produces invalid result at T=${T}`);
                  } else if (length > maxCaptcha) {
                    errors.push(`Level ${key}: formula produces length ${length} at T=${T}, exceeding maxCaptchaLength (${maxCaptcha})`);
                  }
                } catch (e) {
                  errors.push(`Level ${key}: formula evaluation failed at T=${T}: ${e.message}`);
                }
              }
            }
          }
        }
      } else {
        // allowTempAccess=false: should not have maxMinutes or captchaFormula
        if (level.maxMinutes !== undefined) {
          warnings.push(`Level ${key}: maxMinutes is ignored when allowTempAccess is false`);
        }
        if (level.captchaFormula !== undefined) {
          warnings.push(`Level ${key}: captchaFormula is ignored when allowTempAccess is false`);
        }
      }
    }
  }

  // Cross-reference with existing rules
  if (Array.isArray(existingRules) && config.levels) {
    const levelKeys = new Set(Object.keys(config.levels));
    for (const rule of existingRules) {
      if (!levelKeys.has(String(rule.level))) {
        errors.push(`规则 "${rule.domain}" 引用了等级 ${rule.level}，但新配置中不存在此等级。请先修改或删除该规则。`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
