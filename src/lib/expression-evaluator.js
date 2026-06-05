const MAX_DEPTH = 20;
const MAX_EXPR_LENGTH = 200;
const ALLOWED_FUNCTIONS = new Set(['floor', 'ceil', 'round', 'min', 'max']);

// --- Tokenizer ---

const TOKEN_TYPES = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF',
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < expr.length && /[0-9]/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN_TYPES.IDENT, value: ident });
      continue;
    }

    if ('+-*/%'.includes(ch)) {
      tokens.push({ type: TOKEN_TYPES.OP, value: ch });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: TOKEN_TYPES.LPAREN });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: TOKEN_TYPES.RPAREN });
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: TOKEN_TYPES.COMMA });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: TOKEN_TYPES.EOF });
  return tokens;
}

// --- Parser (recursive descent) ---

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.depth = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(expectedType) {
    const token = this.tokens[this.pos];
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type} (${token.value ?? 'EOF'})`);
    }
    this.pos++;
    return token;
  }

  parse() {
    const ast = this.parseExpression();
    if (this.peek().type !== TOKEN_TYPES.EOF) {
      throw new Error(`Unexpected token after expression: ${this.peek().value ?? 'EOF'}`);
    }
    return ast;
  }

  parseExpression() {
    return this.parseAddition();
  }

  parseAddition() {
    let left = this.parseMultiplication();
    while (this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.parseMultiplication();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseMultiplication() {
    let left = this.parseUnary();
    while (this.peek().type === TOKEN_TYPES.OP && ('*/%'.includes(this.peek().value))) {
      const op = this.consume().value;
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '-') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new Error('Expression too deeply nested');
    }

    try {
      const token = this.peek();

      // Number literal
      if (token.type === TOKEN_TYPES.NUMBER) {
        this.consume();
        const value = parseFloat(token.value);
        if (isNaN(value)) {
          throw new Error(`Invalid number: ${token.value}`);
        }
        return { type: 'number', value };
      }

      // Identifier: T variable or function call
      if (token.type === TOKEN_TYPES.IDENT) {
        const name = token.value;

        if (name === 'T') {
          this.consume();
          return { type: 'variable', name: 'T' };
        }

        if (ALLOWED_FUNCTIONS.has(name)) {
          this.consume();
          this.consume(TOKEN_TYPES.LPAREN);

          const args = [];
          if (this.peek().type !== TOKEN_TYPES.RPAREN) {
            args.push(this.parseExpression());
            while (this.peek().type === TOKEN_TYPES.COMMA) {
              this.consume();
              args.push(this.parseExpression());
            }
          }

          this.consume(TOKEN_TYPES.RPAREN);

          if (name === 'min' || name === 'max') {
            if (args.length < 2) {
              throw new Error(`${name}() requires at least 2 arguments`);
            }
          } else {
            if (args.length !== 1) {
              throw new Error(`${name}() requires exactly 1 argument`);
            }
          }

          return { type: 'call', name, args };
        }

        throw new Error(`Unknown identifier: ${name}. Only T and ${[...ALLOWED_FUNCTIONS].join(', ')} are allowed`);
      }

      // Parenthesized expression
      if (token.type === TOKEN_TYPES.LPAREN) {
        this.consume();
        const inner = this.parseExpression();
        this.consume(TOKEN_TYPES.RPAREN);
        return inner;
      }

      throw new Error(`Unexpected token: ${token.value ?? token.type}`);
    } finally {
      this.depth--;
    }
  }
}

// --- Evaluator ---

const MATH_FUNCS = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
};

function evaluateNode(node, T) {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'variable':
      if (node.name === 'T') return T;
      throw new Error(`Unknown variable: ${node.name}`);

    case 'unary':
      if (node.op === '-') return -evaluateNode(node.operand, T);
      throw new Error(`Unknown unary operator: ${node.op}`);

    case 'binary': {
      const left = evaluateNode(node.left, T);
      const right = evaluateNode(node.right, T);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? Infinity : left / right;
        case '%': return right === 0 ? NaN : left % right;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }

    case 'call': {
      const fn = MATH_FUNCS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const args = node.args.map(a => evaluateNode(a, T));
      return fn(...args);
    }

    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

// --- Public API ---

export function parseExpression(expr) {
  if (typeof expr !== 'string') {
    throw new Error('Expression must be a string');
  }
  if (expr.length > MAX_EXPR_LENGTH) {
    throw new Error(`Expression too long (max ${MAX_EXPR_LENGTH} characters)`);
  }
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  return parser.parse();
}

export function evaluateExpression(ast, T) {
  if (typeof T !== 'number' || isNaN(T)) {
    throw new Error('T must be a valid number');
  }
  const result = evaluateNode(ast, T);
  if (typeof result !== 'number' || isNaN(result)) {
    throw new Error('Expression produced an invalid result');
  }
  return result;
}

export function validateExpression(expr) {
  try {
    const ast = parseExpression(expr);
    // Test evaluate at a few sample values
    for (const t of [5, 30, 60, 120]) {
      const result = evaluateExpression(ast, t);
      if (!isFinite(result)) {
        return { valid: false, error: `Expression produces non-finite result at T=${t}` };
      }
    }
    return { valid: true, ast };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

export function evalFormula(expression, T) {
  const ast = parseExpression(expression);
  const raw = evaluateExpression(ast, T);
  return Math.ceil(raw);
}
