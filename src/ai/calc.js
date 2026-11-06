const FUNCS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    log: Math.log10, log10: Math.log10, log2: Math.log2, ln: Math.log, exp: Math.exp, pow: Math.pow,
    min: Math.min, max: Math.max, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
const MAX_LEN = 300;
const MAX_DEPTH = 40;

function tokenize(src) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)|([a-z_][a-z0-9_]*)|(\*\*|[-+*/%^(),×÷]))/iy;
    let pos = 0;
    while (pos < src.length) {
        re.lastIndex = pos;
        const m = re.exec(src);
        if (!m) {
            if (/^\s*$/.test(src.slice(pos))) break;
            throw new Error(`Unexpected character at ${pos + 1}: "${src[pos]}"`);
        }
        pos = re.lastIndex;
        if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
        else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2].toLowerCase() });
        else tokens.push({ t: 'op', v: m[3] === '×' ? '*' : m[3] === '÷' ? '/' : m[3] });
    }
    return tokens;
}

export function calculate(input) {
    const src = String(input || '').trim().replace(/(\d+(?:\.\d+)?)\s*%\s*(?:dari|of)\s+/gi, '($1/100)*');
    if (!src) throw new Error('Expression required. Example: calc (12500 * 3) / 4 + sqrt(81)');
    if (src.length > MAX_LEN) throw new Error('Expression too long.');
    const tokens = tokenize(src);
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const isOp = (v) => peek()?.t === 'op' && peek().v === v;

    const expr = (d) => {
        if (d > MAX_DEPTH) throw new Error('Expression too deeply nested.');
        let left = term(d);
        while (isOp('+') || isOp('-')) {
            const op = take().v;
            const right = term(d);
            left = op === '+' ? left + right : left - right;
        }
        return left;
    };
    const term = (d) => {
        let left = unary(d);
        while (isOp('*') || isOp('/') || isOp('%')) {
            const op = take().v;
            const right = unary(d);
            if ((op === '/' || op === '%') && right === 0) throw new Error('Division by zero.');
            left = op === '*' ? left * right : op === '/' ? left / right : left % right;
        }
        return left;
    };
    const unary = (d) => {
        if (isOp('-')) { take(); return -unary(d); }
        if (isOp('+')) { take(); return unary(d); }
        return power(d);
    };
    const power = (d) => {
        const base = atom(d);
        if (isOp('^') || isOp('**')) {
            take();
            return Math.pow(base, unary(d));
        }
        return base;
    };
    const atom = (d) => {
        const tok = take();
        if (!tok) throw new Error('Unexpected end of expression.');
        if (tok.t === 'num') return tok.v;
        if (tok.t === 'id') {
            if (isOp('(')) {
                take();
                const args = [];
                if (!isOp(')')) {
                    do args.push(expr(d + 1)); while (isOp(',') && take());
                }
                if (!isOp(')')) throw new Error('Missing closing parenthesis.');
                take();
                const fn = FUNCS[tok.v];
                if (!fn) throw new Error(`Unknown function: ${tok.v}`);
                return fn(...args);
            }
            if (tok.v in CONSTS) return CONSTS[tok.v];
            throw new Error(`Unknown name: ${tok.v}`);
        }
        if (tok.v === '(') {
            const v = expr(d + 1);
            if (!isOp(')')) throw new Error('Missing closing parenthesis.');
            take();
            return v;
        }
        throw new Error(`Unexpected "${tok.v}".`);
    };

    const result = expr(0);
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].v}".`);
    if (!Number.isFinite(result)) throw new Error('Result is not a finite number.');
    return result;
}

export function formatNumber(n) {
    if (Number.isInteger(n)) return String(n);
    return String(Number(n.toPrecision(12)));
}
