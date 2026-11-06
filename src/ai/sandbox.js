import fs from 'fs';
import path from 'path';
import { execFile as execFileCb, exec as execCb } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';

const execFileAsync = promisify(execFileCb);
const execAsync = promisify(execCb);

const WORKSPACE_ROOT = process.cwd();
export const SANDBOX_ROOT = path.join(WORKSPACE_ROOT, '.sandbox');

const MAX_CODE_BYTES = 400_000;
const MAX_OUTPUT_CHARS = 8_000;

function truncate(text = '', max = MAX_OUTPUT_CHARS) {
    const s = String(text ?? '');
    if (s.length <= max) return s;
    return s.slice(0, max) + '\n…(truncated)';
}
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 60_000;

const RUN_BLOCKLIST = [
    /rm\s+-rf\s+\/(?!\S)/,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    />\s*\/dev\/(sd|nvme|hd)/,
    /\b(shutdown|reboot|poweroff)\b/,
    /\bchmod\s+-R\s+777\s+\//,
    /\bchown\s+-R\s+\S+\s+\//,
    /process\.exit\s*\(\s*0\s*\)\s*;?\s*require\s*\(\s*['"]child_process['"]\s*\)/,
];

const LANG = {
    node: { bin: 'node', ext: '.js', aliases: ['js', 'javascript'] },
    python: { bin: 'python3', ext: '.py', aliases: ['py', 'python3'] },
    bash: { bin: 'bash', ext: '.sh', aliases: ['sh', 'shell'] },
};

function ensureSandbox() {
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    return SANDBOX_ROOT;
}

export function resolveInSandbox(target = '.') {
    ensureSandbox();
    const raw = String(target || '.').trim() || '.';
    const resolved = path.resolve(SANDBOX_ROOT, raw);
    if (resolved !== SANDBOX_ROOT && !resolved.startsWith(SANDBOX_ROOT + path.sep)) return null;
    return resolved;
}

export function sandboxRel(absPath) {
    return path.relative(SANDBOX_ROOT, absPath) || '.';
}

function normalizeLang(input) {
    const key = String(input || 'node').trim().toLowerCase();
    if (LANG[key]) return key;
    for (const [name, meta] of Object.entries(LANG)) {
        if (meta.aliases.includes(key)) return name;
    }
    return null;
}

function safeEnv() {
    return {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: SANDBOX_ROOT,
        TMPDIR: SANDBOX_ROOT,
        LANG: process.env.LANG || 'C.UTF-8',
        NODE_NO_WARNINGS: '1',
    };
}

function assertNotBlocked(text) {
    const s = String(text || '');
    if (RUN_BLOCKLIST.some(rx => rx.test(s))) {
        throw new Error('Blocked pattern detected in sandbox input.');
    }
}

export function sandboxWrite(relPath, content = '') {
    const target = resolveInSandbox(relPath);
    if (!target) throw new Error('Path escapes sandbox.');
    if (Buffer.byteLength(String(content), 'utf8') > MAX_CODE_BYTES) {
        throw new Error(`Content too large. Max ${MAX_CODE_BYTES} bytes.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(content), 'utf8');
    return sandboxRel(target);
}

export function sandboxRead(relPath) {
    const target = resolveInSandbox(relPath);
    if (!target) throw new Error('Path escapes sandbox.');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        throw new Error(`Sandbox file not found: ${relPath}`);
    }
    const buf = fs.readFileSync(target);
    if (buf.length > MAX_CODE_BYTES) throw new Error(`File too large (${buf.length} bytes).`);
    return buf.toString('utf8');
}

export function sandboxList(relPath = '.') {
    const target = resolveInSandbox(relPath);
    if (!target) throw new Error('Path escapes sandbox.');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
        throw new Error(`Sandbox folder not found: ${relPath}`);
    }
    const entries = fs.readdirSync(target, { withFileTypes: true })
        .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
        .sort((a, b) => a.localeCompare(b));
    return {
        path: sandboxRel(target),
        entries,
    };
}

export function sandboxClear() {
    if (fs.existsSync(SANDBOX_ROOT)) {
        fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
    }
    ensureSandbox();
    return true;
}

export async function sandboxExec(command, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    ensureSandbox();
    const cmd = String(command || '').trim();
    if (!cmd) throw new Error('Command required.');
    assertNotBlocked(cmd);
    const timeout = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
    try {
        const { stdout, stderr } = await execAsync(cmd, {
            cwd: SANDBOX_ROOT,
            timeout,
            maxBuffer: 2 * 1024 * 1024,
            env: safeEnv(),
            shell: '/bin/bash',
        });
        const out = ((stdout || '') + (stderr ? `\n${stderr}` : '')).trim() || '(no output)';
        return { ok: true, output: truncate(out, MAX_OUTPUT_CHARS) };
    } catch (err) {
        const out = ((err.stdout || '') + (err.stderr || err.message || '')).trim();
        return { ok: false, output: truncate(out || err.message, MAX_OUTPUT_CHARS), code: err.code };
    }
}

export async function sandboxRunCode({ language = 'node', code = '', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    ensureSandbox();
    const lang = normalizeLang(language);
    if (!lang) throw new Error(`Unsupported language: ${language}. Use node, python, or bash.`);
    const source = String(code || '');
    if (!source.trim()) throw new Error('Code is empty.');
    if (Buffer.byteLength(source, 'utf8') > MAX_CODE_BYTES) {
        throw new Error(`Code too large. Max ${MAX_CODE_BYTES} bytes.`);
    }
    assertNotBlocked(source);

    const meta = LANG[lang];
    const id = randomBytes(6).toString('hex');
    const fileName = `run_${id}${meta.ext}`;
    const filePath = path.join(SANDBOX_ROOT, fileName);
    fs.writeFileSync(filePath, source, 'utf8');

    const timeout = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
    try {
        const { stdout, stderr } = await execFileAsync(meta.bin, [filePath], {
            cwd: SANDBOX_ROOT,
            timeout,
            maxBuffer: 2 * 1024 * 1024,
            env: safeEnv(),
        });
        const out = ((stdout || '') + (stderr ? `\n${stderr}` : '')).trim() || '(no output)';
        return {
            ok: true,
            language: lang,
            file: fileName,
            output: truncate(out, MAX_OUTPUT_CHARS),
        };
    } catch (err) {
        const out = ((err.stdout || '') + (err.stderr || err.message || '')).trim();
        return {
            ok: false,
            language: lang,
            file: fileName,
            output: truncate(out || err.message, MAX_OUTPUT_CHARS),
            code: err.code,
        };
    }
}

export function parseLangAndCode(raw) {
    const text = String(raw || '');
    const nl = text.indexOf('\n');
    if (nl === -1) {
        const token = text.trim().toLowerCase();
        if (normalizeLang(token)) return { language: normalizeLang(token), code: '' };
        return { language: 'node', code: text };
    }
    const first = text.slice(0, nl).trim().toLowerCase();
    const rest = text.slice(nl + 1);
    if (normalizeLang(first)) return { language: normalizeLang(first), code: rest };
    return { language: 'node', code: text };
}
