Site Blocker — 技术框架与实现
=============================

架构概览
--------

基于 Manifest V3 的 Edge 扩展，ES Module 模式，无框架、无构建工具，纯原生 HTML/CSS/JS。

```
site_blocker/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js      # 导航拦截 + 临时授权到期处理
│   ├── lib/
│   │   ├── constants.js           # 存储 key、页面路径
│   │   ├── config.js              # 配置管理（加载/缓存/存储/默认值）
│   │   ├── config-validator.js    # 配置校验（结构 + 公式试算 + 规则交叉校验）
│   │   ├── expression-evaluator.js # 安全数学表达式解析器
│   │   ├── captcha.js             # 验证码长度计算 + 生成 + 规则解锁验证码
│   │   ├── storage.js             # chrome.storage.local CRUD 封装
│   │   ├── domain.js              # 域名规范化 + 匹配
│   │   └── rule-engine.js         # 拦截判定 + 过期清理
│   └── pages/
│       ├── popup/                 # 弹窗：规则管理
│       ├── blocked/               # 拦截页：申请临时访问
│       └── options/               # 选项页：自定义配置
└── README.md
```

数据模型
--------

### chrome.storage.local 数据结构

```json
{
  "rules": [
    {
      "id": "rule_<base36timestamp>_<8hex>",
      "domain": "youtube.com",
      "level": 1,
      "enabled": true,
      "note": "视频站",
      "createdAt": 1710000000000,
      "updatedAt": 1710000000000
    }
  ],
  "temporaryAccess": {
    "youtube.com": {
      "startAt": 1710000100000,
      "expireAt": 1710001000000,
      "grantedAt": 1710000100000
    }
  },
  "config": {
    "version": 1,
    "minRequestMinutes": 5,
    "maxCaptchaLength": 100,
    "captchaChars": { "upper": "...", "lower": "...", "digits": "...", "symbols": "..." },
    "levels": {
      "0": { "label": "完全禁止", "allowTempAccess": false },
      "1": { "label": "受控使用", "allowTempAccess": true, "maxMinutes": 30, "captchaFormula": { "type": "linear", "minLength": 20, "maxLength": 50 } },
      "2": { "label": "偶尔使用", "allowTempAccess": true, "maxMinutes": 120, "captchaFormula": { "type": "stepped", "baseLength": 5, "baseMinutes": 5, "stepMinutes": 10, "stepLength": 5 } }
    }
  }
}
```

### 配置系统 (config)

配置以 JSON 对象存储在 `chrome.storage.local` 的 `config` key 下，是所有行为参数的唯一来源。

**等级定义**：levels 是一个以等级 key（非负整数字符串）为键的对象。每个等级包含 `label`（显示名称）和 `allowTempAccess`（是否允许临时访问）。允许临时访问的等级还需定义 `maxMinutes`（最大申请时长）和 `captchaFormula`（验证码长度公式）。

**三种公式类型**：

| 类型 | 公式 | 所需字段 |
|------|------|---------|
| `linear` | `ceil(minLength + (maxLength - minLength) * (T - minRequestMinutes) / (maxMinutes - minRequestMinutes))`，clamp 到 [minLength, maxLength] | `minLength`, `maxLength` |
| `stepped` | `baseLength + stepLength * floor((T - baseMinutes) / stepMinutes)` | `baseLength`, `baseMinutes`, `stepMinutes`, `stepLength` |
| `expression` | 安全数学表达式求值，变量 T 代表申请分钟数 | `expression` |

所有公式最终结果 clamp 到 [4, maxCaptchaLength]。

**配置缓存**：`config.js` 维护内存缓存 `_configCache`，`getConfig()` 优先返回缓存。`chrome.storage.onChanged` 监听器在配置变更时自动刷新缓存，确保 service worker、popup、blocked 页面同步更新。

**配置迁移**：首次加载时若 `config` key 不存在，写入 `DEFAULT_CONFIG`。若存在旧版 `settings` key，将其 `maxCaptchaLength` 合并到新配置后删除旧 key。

核心流程
--------

### 导航拦截

`service-worker.js` 监听 `chrome.webNavigation.onBeforeNavigate`，仅处理 `frameId === 0` 的主框架导航：

1. `extractHost(url)` 提取主机名
2. `getRules()` + `getTemporaryAccess()` 加载规则和临时授权
3. `shouldBlock(host, rules, tempAccess, now)` 判定是否拦截
4. 拦截时构造 `blocked.html?target=...&domain=...` URL，通过 `chrome.tabs.update` 重定向

### 临时授权到期

- `blocked.js` 授予临时访问时，通过 `chrome.runtime.sendMessage` 通知 service worker
- Service worker 调用 `chrome.alarms.create` 注册定时器
- 定时器触发时：删除临时授权 + 刷新所有匹配域名的标签页
- 浏览器启动时：清理过期记录 + 为仍有效的记录重注册定时器

### 验证码生成

`captcha.js` 的 `generateCaptcha(length)` 从配置读取字符集，保证至少包含大写、小写、数字、符号各一个（对应字符集非空时），剩余字符从合并字符集随机填充，Fisher-Yates 洗牌。随机源为 `crypto.getRandomValues()`。

### 规则管理解锁

`popup.js` 的解锁机制使用独立的验证码：`generateRuleCaptcha()` 生成 10 字符大小写混合字符串，`transformRuleCaptcha()` 要求用户对每个字母翻转大小写后再移 2 位（如 `a` → `C`，`Z` → `B`）。输入错误后自动生成新验证码。

安全表达式求值器
----------------

`expression-evaluator.js` 实现了一个递归下降解析器，将数学表达式字符串解析为 AST 再求值。

**语法**（优先级由低到高）：

```
expression    := addition
addition      := multiplication (('+' | '-') multiplication)*
multiplication := unary (('*' | '/' | '%') unary)*
unary         := '-' unary | primary
primary       := NUMBER | 'T' | function_call | '(' expression ')'
function_call := ('floor' | 'ceil' | 'round' | 'min' | 'max') '(' expression (',' expression)* ')'
```

**AST 节点类型**：`number`、`variable`（仅 T）、`binary`（+,-,*,/,%）、`unary`（-）、`call`（白名单函数）

**安全措施**：
- 仅允许变量 `T`，其他标识符报错
- 函数白名单：floor、ceil、round、min、max
- 最大嵌套深度 20，防止栈溢出
- 表达式最长 200 字符
- 不使用 `eval()` 或 `Function()`

配置校验
--------

`config-validator.js` 的 `validateConfig(config, existingRules)` 返回 `{ valid, errors, warnings }`：

**结构校验**：version、minRequestMinutes、maxCaptchaLength 的类型和范围；captchaChars 各子集非空（symbols 可为空）且无重复字符；每个等级必须有 label 和 allowTempAccess；allowTempAccess=true 时必须有 maxMinutes 和 captchaFormula。

**公式校验**：类型特定字段完整性；expression 类型需通过 parseExpression 语法检查；对所有公式在 T=minRequestMinutes、中间值、T=maxMinutes 三个点试算，验证结果为有限正整数且不超过 maxCaptchaLength。

**交叉校验**：加载现有 rules，检查是否有规则引用了新配置中不存在的等级。若有则报硬错误，阻止保存。

域名匹配
--------

`domain.js` 提供两个核心函数：

- `normalizeDomain(input)`：trim、小写、去协议头、去 `www.` 前缀、去尾部 `/` 和 `.`、仅保留 hostname
- `isDomainMatched(host, ruleDomain)`：精确匹配或 `host.endsWith('.' + ruleDomain)`，实现子域名匹配

权限说明
--------

| 权限 | 用途 |
|------|------|
| `storage` | 读写规则、临时授权、配置 |
| `webNavigation` | 监听导航事件拦截访问 |
| `tabs` | 重定向被拦截标签页、到期后刷新标签页 |
| `alarms` | 临时访问到期定时器 |
| `<all_urls>` | 拦截任意网站的导航 |
