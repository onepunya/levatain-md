import fs from 'fs';
import path from 'path';
import { exec as execCb, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import {
    sandboxWrite,
    sandboxRead,
    sandboxList,
    sandboxClear,
    sandboxExec,
    sandboxRunCode,
    parseLangAndCode,
} from './sandbox.js';
import { EXTRA_TOOL_DEFS } from './extra-tools.js';

const execAsync = promisify(execCb);
const execFileAsync = promisify(execFileCb);
const WORKSPACE_ROOT = process.cwd();
const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 2_000_000;
const MAX_EXEC_MS = 30_000;
const MAX_FETCH_BYTES = 500_000;
const MAX_OUT_CHAT = 3500;
const MAX_OUT_LLM = 12_000;
const MAX_GREP_MATCHES = 80;
const MAX_GREP_FILES = 6000;
const MAX_GREP_FILE_BYTES = 1_000_000;
const GREP_SKIP_DIRS = new Set(['node_modules', '.git', 'session', '.sandbox', 'database']);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|mp3|mp4|ogg|opus|wav|webm|mkv|zip|gz|tar|pdf|woff2?|ttf|otf|so|node|db|sqlite)$/i;
const SECRET_KEY_RX = /(KEY|TOKEN|SECRET|COOKIE|PASS|PWD|AUTH)/i;
const EDIT_RX = /^<{3,}[ \t]*SEARCH[ \t]*\r?\n([\s\S]*?)\r?\n={3,}[ \t]*\r?\n([\s\S]*?)(?:\r?\n)?^>{3,}[ \t]*REPLACE[ \t]*$/gm;
const EDIT_FORMAT_HINT = 'No edit block found. Format:\npath\n<<<<<<< SEARCH\nexact old text\n=======\nnew text\n>>>>>>> REPLACE';

const BLOCKLIST = [
    /rm\s+-rf\s+\/(?!\S)/,
    /rm\s+-rf\s+(\.|\*|~)(\s|$)/,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    />\s*\/dev\/(sd|nvme|hd)/,
    /\b(shutdown|reboot|poweroff)\b/,
    /\bchmod\s+-R\s+777\s+\//,
    /\bchown\s+-R\s+\S+\s+\//,
    /\|\s*(sudo\s+)?(ba|z)?sh\b/,
];

function truncate(text = '', max = MAX_OUT_CHAT) {
    const s = String(text ?? '');
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n… (truncated, ${s.length - max} more chars)`;
}

const outLimit = (ctx) => (ctx?.llm ? MAX_OUT_LLM : MAX_OUT_CHAT);

export function redactSecrets(text) {
    let out = String(text ?? '');
    for (const [key, value] of Object.entries(process.env)) {
        if (!value || value.length < 8 || !SECRET_KEY_RX.test(key)) continue;
        if (out.includes(value)) out = out.split(value).join(`[REDACTED:${key}]`);
    }
    return out;
}

function resolveInWorkspace(target) {
    const raw = String(target || '').trim();
    if (!raw) return null;
    const resolved = path.resolve(WORKSPACE_ROOT, raw);
    if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) return null;
    return resolved;
}

function isSecretPath(abs) {
    const base = path.basename(abs);
    if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') return true;
    const top = path.relative(WORKSPACE_ROOT, abs).split(path.sep)[0];
    return top === 'session' || top === '.git';
}

function rel(p) {
    return path.relative(WORKSPACE_ROOT, p) || '.';
}

function splitPathAndContent(raw) {
    const text = String(raw || '');
    const nl = text.indexOf('\n');
    if (nl === -1) return { filePath: text.trim().split(/\s/)[0] || '', content: '' };
    return {
        filePath: text.slice(0, nl).trim().split(/\s/)[0] || '',
        content: text.slice(nl + 1),
    };
}

async function toolReadFile(args, ctx) {
    const [filePath, range] = String(args || '').trim().split(/\s+/);
    if (!filePath) throw new Error('Path required. Example: readfile package.json');
    const target = resolveInWorkspace(filePath);
    if (!target) throw new Error('Path escapes workspace.');
    if (isSecretPath(target)) throw new Error('Secret file: not readable through agent tools.');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`File not found: ${filePath}`);
    const stat = fs.statSync(target);
    if (stat.size > MAX_READ_BYTES) throw new Error(`File too large (${stat.size} bytes). Max ${MAX_READ_BYTES}.`);
    let content = fs.readFileSync(target, 'utf8');
    let label = rel(target);
    const m = /^(\d+)-(\d+)$/.exec(range || '');
    if (m) {
        const start = Math.max(1, Number(m[1]));
        const end = Math.max(start, Number(m[2]));
        const lines = content.split('\n');
        content = lines.slice(start - 1, end).join('\n');
        label += ` (lines ${start}-${Math.min(end, lines.length)} of ${lines.length})`;
    }
    return `📄 ${label}\n\`\`\`\n${truncate(content, outLimit(ctx))}\n\`\`\``;
}

async function toolWriteFile(args) {
    const { filePath, content } = splitPathAndContent(args);
    if (!filePath) throw new Error('Path required. Example: writefile notes.txt\\ncontent here');
    const target = resolveInWorkspace(filePath);
    if (!target) throw new Error('Path escapes workspace.');
    if (isSecretPath(target)) throw new Error('Secret file: not writable through agent tools.');
    if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) throw new Error(`Content too large. Max ${MAX_WRITE_BYTES} bytes.`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    return `✅ Wrote \`${rel(target)}\` (${Buffer.byteLength(content, 'utf8')} bytes)`;
}

async function toolEditFile(args) {
    const { filePath, content } = splitPathAndContent(args);
    if (!filePath) throw new Error(EDIT_FORMAT_HINT);
    const target = resolveInWorkspace(filePath);
    if (!target) throw new Error('Path escapes workspace.');
    if (isSecretPath(target)) throw new Error('Secret file: not editable through agent tools.');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`File not found: ${filePath}`);
    if (fs.statSync(target).size > MAX_WRITE_BYTES) throw new Error('File too large to edit.');
    const blocks = [...content.matchAll(EDIT_RX)].map(m => ({ search: m[1], replace: m[2] }));
    if (!blocks.length) throw new Error(EDIT_FORMAT_HINT);

    const original = fs.readFileSync(target, 'utf8');
    const crlf = original.includes('\r\n');
    let text = crlf ? original.replace(/\r\n/g, '\n') : original;
    let added = 0;
    let removed = 0;

    blocks.forEach((block, i) => {
        const search = block.search.replace(/\r\n/g, '\n');
        const replace = block.replace.replace(/\r\n/g, '\n');
        if (!search.trim()) throw new Error(`Block ${i + 1}: SEARCH is empty.`);
        const count = text.split(search).length - 1;
        if (count === 0) throw new Error(`Block ${i + 1}: SEARCH text not found in ${filePath}. Nothing was changed. Re-read the file (readfile) and copy the text exactly, including indentation.`);
        if (count > 1) throw new Error(`Block ${i + 1}: SEARCH matches ${count} places. Nothing was changed. Add more surrounding lines so it is unique.`);
        text = text.replace(search, () => replace);
        removed += search.split('\n').length;
        added += replace.split('\n').length;
    });

    fs.writeFileSync(target, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');

    const checkable = /\.(c|m)?js$/.test(target) && !target.includes(`${path.sep}dashboard-client${path.sep}`);
    if (checkable) {
        try {
            await execFileAsync(process.execPath, ['--check', target], { timeout: 15_000 });
        } catch (err) {
            fs.writeFileSync(target, original, 'utf8');
            throw new Error(`Syntax error after edit, file restored to the original.\n${truncate(String(err.stderr || err.message), 1500)}`);
        }
    }

    return `✅ Edited \`${rel(target)}\` (${blocks.length} block${blocks.length > 1 ? 's' : ''}, -${removed}/+${added} lines${checkable ? ', syntax OK' : ''})`;
}

async function toolDeleteFile(args) {
    const filePath = String(args || '').trim().split(/\s/)[0];
    if (!filePath) throw new Error('Path required. Example: deletefile temp.txt');
    const target = resolveInWorkspace(filePath);
    if (!target) throw new Error('Path escapes workspace.');
    if (target === WORKSPACE_ROOT) throw new Error('Cannot delete workspace root.');
    if (!fs.existsSync(target)) throw new Error(`Not found: ${filePath}`);
    const st = fs.statSync(target);
    if (st.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true });
        return `🗑️ Deleted folder \`${rel(target)}\``;
    }
    fs.unlinkSync(target);
    return `🗑️ Deleted \`${rel(target)}\``;
}

async function toolListDir(args) {
    const target = resolveInWorkspace(String(args || '').trim() || '.');
    if (!target) throw new Error('Path escapes workspace.');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`Folder not found: ${args || '.'}`);
    const entries = fs.readdirSync(target, { withFileTypes: true })
        .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
        .sort((a, b) => a.localeCompare(b));
    const header = `📂 \`${rel(target)}\` (${entries.length})`;
    if (!entries.length) return `${header}\n(empty)`;
    return `${header}\n\`\`\`\n${entries.join('\n')}\n\`\`\``;
}

function* walkFiles(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!GREP_SKIP_DIRS.has(entry.name)) yield* walkFiles(full);
        } else if (entry.isFile()) {
            yield full;
        }
    }
}

async function toolSearchInFiles(args) {
    const lines = String(args || '').split('\n').map(l => l.trim()).filter(Boolean);
    const pattern = lines[0] || '';
    const scope = lines[1] || '.';
    const extFilter = (lines[2] || '').replace(/^\*/, '').toLowerCase();
    if (!pattern) throw new Error('Pattern required. Example: search_in_files handleAI');
    const root = resolveInWorkspace(scope);
    if (!root || !fs.existsSync(root)) throw new Error(`Path not found: ${scope}`);

    let rx;
    try {
        rx = new RegExp(pattern, 'i');
    } catch {
        rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const files = fs.statSync(root).isFile() ? [root] : walkFiles(root);
    const hits = [];
    const filesWithHits = new Set();
    let total = 0;
    let scanned = 0;
    let capped = false;

    for (const file of files) {
        if (++scanned > MAX_GREP_FILES) {
            capped = true;
            break;
        }
        if (isSecretPath(file) || BINARY_EXT.test(file)) continue;
        if (extFilter && !file.toLowerCase().endsWith(extFilter)) continue;
        let stat;
        try {
            stat = fs.statSync(file);
        } catch {
            continue;
        }
        if (stat.size > MAX_GREP_FILE_BYTES) continue;
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('\0')) continue;
        const fileLines = text.split('\n');
        for (let i = 0; i < fileLines.length; i++) {
            if (!rx.test(fileLines[i])) continue;
            total++;
            filesWithHits.add(file);
            if (hits.length < MAX_GREP_MATCHES) hits.push(`${rel(file)}:${i + 1}: ${fileLines[i].trim().slice(0, 200)}`);
        }
    }

    if (!total) return `🔎 \`${pattern}\` — no matches in \`${rel(root)}\`${capped ? ' (scan limit reached)' : ''}`;
    const more = total > hits.length ? `\n… ${total - hits.length} more matches, narrow the pattern or path` : '';
    return `🔎 \`${pattern}\` — ${total} match${total > 1 ? 'es' : ''} in ${filesWithHits.size} file${filesWithHits.size > 1 ? 's' : ''}\n\`\`\`\n${hits.join('\n')}${more}\n\`\`\``;
}

async function toolExec(args, ctx) {
    const cmd = String(args || '').trim();
    if (!cmd) throw new Error('Shell command required. Example: exec ls -la');
    if (BLOCKLIST.some(rx => rx.test(cmd))) throw new Error(`Blocked command: ${cmd}`);
    try {
        const { stdout, stderr } = await execAsync(cmd, {
            cwd: WORKSPACE_ROOT,
            timeout: MAX_EXEC_MS,
            maxBuffer: 2 * 1024 * 1024,
            env: process.env,
        });
        const out = truncate(((stdout || '') + (stderr ? `\n${stderr}` : '')).trim() || '(no output)', outLimit(ctx));
        return `💻 \`${cmd}\`\n\`\`\`\n${out}\n\`\`\``;
    } catch (err) {
        const out = truncate(((err.stdout || '') + (err.stderr || err.message || '')).trim(), outLimit(ctx));
        throw new Error(`\`${cmd}\` failed\n\`\`\`\n${out || err.message}\n\`\`\``);
    }
}

async function httpRequest({ method, url, headers = {}, body }, ctx) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https allowed.');
    const res = await fetch(url, {
        method,
        headers: { 'user-agent': 'Levatain-Agent/1.0', accept: 'application/json,text/plain,*/*', ...headers },
        body,
        signal: AbortSignal.timeout(20_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FETCH_BYTES) throw new Error(`Response too large (${buf.length} bytes).`);
    const text = buf.toString('utf8');
    return `🌐 ${method} ${res.status} ${res.statusText}\nURL: ${url}\n\`\`\`\n${truncate(text, outLimit(ctx))}\n\`\`\``;
}

async function toolHttpGet(args, ctx) {
    const url = String(args || '').trim().split(/\s/)[0];
    if (!url) throw new Error('URL required. Example: httpget https://example.com');
    return httpRequest({ method: 'GET', url }, ctx);
}

function parsePostArgs(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    const first = (lines.shift() || '').trim();
    const split = first.search(/\s/);
    const url = split === -1 ? first : first.slice(0, split);
    if (split !== -1) lines.unshift(first.slice(split).trim());
    const headers = {};
    while (lines.length) {
        const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[0]);
        if (!m) break;
        headers[m[1].toLowerCase()] = m[2];
        lines.shift();
    }
    if (lines.length && lines[0].trim() === '') lines.shift();
    return { url, headers, body: lines.join('\n') };
}

async function toolHttpPost(args, ctx) {
    const { url, headers, body } = parsePostArgs(args);
    if (!url) throw new Error('URL required. Example: http_post https://httpbin.org/post\n{"a":1}');
    if (body && !headers['content-type']) {
        try {
            JSON.parse(body);
            headers['content-type'] = 'application/json';
        } catch {
            headers['content-type'] = 'text/plain';
        }
    }
    return httpRequest({ method: 'POST', url, headers, body: body || undefined }, ctx);
}

async function toolWorkspaceInfo() {
    const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
    let name = 'unknown';
    try {
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            name = pkg.name || name;
        }
    } catch {}
    const top = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
        .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 40);
    return `🏠 Workspace\nName: ${name}\nRoot: ${WORKSPACE_ROOT}\n\`\`\`\n${top.join('\n')}\n\`\`\``;
}

async function toolSandboxWrite(args) {
    const text = String(args || '');
    const nl = text.indexOf('\n');
    const filePath = (nl === -1 ? text : text.slice(0, nl)).trim().split(/\s/)[0];
    const content = nl === -1 ? '' : text.slice(nl + 1);
    if (!filePath) throw new Error('Path required. Example: sandbox_write test.js\nconsole.log(1)');
    const written = sandboxWrite(filePath, content);
    return `✅ Sandbox wrote \`${written}\` (${Buffer.byteLength(content, 'utf8')} bytes)\nRoot: \`.sandbox/\``;
}

async function toolSandboxRead(args, ctx) {
    const filePath = String(args || '').trim().split(/\s/)[0];
    if (!filePath) throw new Error('Path required. Example: sandbox_read test.js');
    const content = sandboxRead(filePath);
    return `📄 sandbox/${filePath}\n\`\`\`\n${truncate(content, outLimit(ctx))}\n\`\`\``;
}

async function toolSandboxList(args) {
    const { path: pth, entries } = sandboxList(String(args || '').trim() || '.');
    const header = `📂 sandbox/${pth} (${entries.length})`;
    if (!entries.length) return `${header}\n(empty)`;
    return `${header}\n\`\`\`\n${entries.join('\n')}\n\`\`\``;
}

async function toolSandboxClear() {
    sandboxClear();
    return '🧹 Sandbox cleared (`.sandbox/` is empty).';
}

async function toolSandboxExec(args) {
    const result = await sandboxExec(String(args || '').trim());
    const status = result.ok ? 'OK' : 'FAIL';
    return `💻 sandbox exec [${status}]\n\`\`\`\n${result.output}\n\`\`\``;
}

async function toolSandboxRun(args) {
    const { language, code } = parseLangAndCode(args);
    if (!code.trim()) {
        throw new Error('Code required. First line = language (node|python|bash), rest = code.\nExample:\nsandbox_run node\nconsole.log(1+1)');
    }
    const result = await sandboxRunCode({ language, code });
    const status = result.ok ? 'OK' : 'FAIL';
    return `🧪 sandbox_run ${result.language} [${status}] → ${result.file}\n\`\`\`\n${result.output}\n\`\`\``;
}

const TOOL_DEFS = [
    {
        name: 'readfile',
        aliases: ['read_file'],
        ownerOnly: true,
        description: 'Read a text file from the bot project workspace. Optional line range as second token (readfile path 100-200) for big files',
        examples: ['readfile package.json', 'readfile src/api/llm.js 100-180'],
        argsHint: 'relative path [start-end]',
        run: toolReadFile,
    },
    {
        name: 'search_in_files',
        aliases: ['grep', 'search_files', 'find_in_files'],
        ownerOnly: true,
        description: 'Search text/regex (case-insensitive) across the project source, returns file:line matches. Use this BEFORE readfile when you do not know which file holds something. Line 1 = pattern, optional line 2 = folder/file scope, optional line 3 = extension filter (.js)',
        examples: ['search_in_files handleAI', 'search_in_files runAgentTool\nsrc\n.js'],
        argsHint: 'pattern\\n[scope]\\n[.ext]',
        run: toolSearchInFiles,
    },
    {
        name: 'writefile',
        aliases: ['write_file'],
        ownerOnly: true,
        description: 'Create a NEW file or fully overwrite one in the bot project workspace (path on first line, content after newline). For changing part of an existing file use edit_file instead',
        examples: ['writefile notes.txt\nhello world', 'writefile tmp/test.json\n{"ok":true}'],
        argsHint: 'path\\ncontent',
        run: toolWriteFile,
    },
    {
        name: 'edit_file',
        aliases: ['editfile', 'patch_file'],
        ownerOnly: true,
        description: 'Patch part of an existing file by replacing exact text, without rewriting the whole file. Line 1 = path, then one or more blocks "<<<<<<< SEARCH / old text / ======= / new text / >>>>>>> REPLACE" (each marker on its own line). SEARCH must match exactly once. JS files are syntax-checked and rolled back if broken',
        examples: ['edit_file src/config.js\n<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE'],
        argsHint: 'path\\n<<<<<<< SEARCH\\nold\\n=======\\nnew\\n>>>>>>> REPLACE',
        run: toolEditFile,
    },
    {
        name: 'deletefile',
        aliases: ['rmfile', 'delete_file'],
        ownerOnly: true,
        description: 'Delete a file or folder inside the bot project workspace',
        examples: ['deletefile notes.txt', 'deletefile tmp/cache'],
        argsHint: 'relative path',
        run: toolDeleteFile,
    },
    {
        name: 'listdir',
        aliases: ['lsdir', 'list_dir'],
        ownerOnly: true,
        description: 'List files and folders in a directory of the bot project workspace',
        examples: ['listdir', 'listdir src/api', 'listdir plugins/owner'],
        argsHint: 'relative directory path (optional, default .)',
        run: toolListDir,
    },
    {
        name: 'exec',
        aliases: ['sh', 'term'],
        ownerOnly: true,
        description: 'PROJECT-level shell command on the REAL bot workspace root (git, npm, node on project files, ls/cat, curl to check an API). Effects are real. Never use it for trial code, scratch files or experiments: that belongs to sandbox_run / sandbox_exec',
        examples: ['exec ls -la', 'exec node -v', 'exec git status'],
        argsHint: 'shell command string',
        run: toolExec,
    },
    {
        name: 'httpget',
        aliases: ['fetch', 'http_get'],
        ownerOnly: true,
        description: 'HTTP GET a URL and return status + body text (for checking APIs or pages)',
        examples: ['httpget https://example.com', 'httpget https://api.github.com'],
        argsHint: 'full http/https URL',
        run: toolHttpGet,
    },
    {
        name: 'http_post',
        aliases: ['httppost', 'post'],
        ownerOnly: true,
        description: 'HTTP POST to a URL for testing APIs. Line 1 = URL, optional "Header: value" lines, then the body (JSON is detected automatically, blank line before body is optional)',
        examples: ['http_post https://httpbin.org/post\n{"name":"test"}', 'http_post https://api.example.com/v1/x\nAuthorization: Bearer abc\n\n{"q":"hi"}'],
        argsHint: 'url\\n[Header: value]\\n\\nbody',
        run: toolHttpPost,
    },
    {
        name: 'workspace',
        aliases: ['projectinfo', 'cwdinfo'],
        ownerOnly: true,
        description: 'Show bot workspace root path, package name, and top-level files',
        examples: ['workspace'],
        argsHint: '(no args)',
        run: async () => toolWorkspaceInfo(),
    },
    {
        name: 'sandbox_run',
        aliases: ['run_code', 'runcode'],
        ownerOnly: true,
        description: 'ISOLATED: run code inside .sandbox (first line: node|python|bash, rest: source code). Default place to test any new or experimental code without touching the main project',
        examples: ['sandbox_run node\nconsole.log(1+1)', 'sandbox_run python\nprint(2+2)'],
        argsHint: 'language\\ncode',
        run: toolSandboxRun,
    },
    {
        name: 'sandbox_write',
        aliases: ['sb_write'],
        ownerOnly: true,
        description: 'ISOLATED: write a file inside the .sandbox folder (not the main project)',
        examples: ['sandbox_write demo.js\nconsole.log("hi")'],
        argsHint: 'path\\ncontent',
        run: toolSandboxWrite,
    },
    {
        name: 'sandbox_read',
        aliases: ['sb_read'],
        ownerOnly: true,
        description: 'ISOLATED: read a file from the .sandbox folder',
        examples: ['sandbox_read demo.js'],
        argsHint: 'relative path inside sandbox',
        run: toolSandboxRead,
    },
    {
        name: 'sandbox_list',
        aliases: ['sb_list', 'sandbox_ls'],
        ownerOnly: true,
        description: 'ISOLATED: list files inside the .sandbox folder',
        examples: ['sandbox_list', 'sandbox_list subdir'],
        argsHint: 'optional relative directory',
        run: toolSandboxList,
    },
    {
        name: 'sandbox_exec',
        aliases: ['sb_exec'],
        ownerOnly: true,
        description: 'ISOLATED: shell command with cwd forced to .sandbox and a stripped environment (install test deps, run scripts, experiments)',
        examples: ['sandbox_exec ls -la', 'sandbox_exec node demo.js'],
        argsHint: 'shell command',
        run: toolSandboxExec,
    },
    {
        name: 'sandbox_clear',
        aliases: ['sb_clear'],
        ownerOnly: true,
        description: 'ISOLATED: delete all files in the .sandbox folder',
        examples: ['sandbox_clear'],
        argsHint: '(no args)',
        run: async () => toolSandboxClear(),
    },
];

const BUILTIN_FLAGS = {
    readfile: { parallelSafe: true },
    search_in_files: { parallelSafe: true },
    listdir: { parallelSafe: true },
    workspace: { parallelSafe: true },
    sandbox_read: { parallelSafe: true },
    sandbox_list: { parallelSafe: true },
    httpget: { parallelSafe: true, untrusted: true },
    http_post: { dangerous: true, untrusted: true },
    writefile: { dangerous: true },
    edit_file: { dangerous: true },
    deletefile: { dangerous: true },
    exec: { dangerous: true },
    sandbox_run: { dangerous: true },
    sandbox_write: { dangerous: true },
    sandbox_exec: { dangerous: true },
};
for (const def of TOOL_DEFS) Object.assign(def, BUILTIN_FLAGS[def.name] || {});
TOOL_DEFS.push(...EXTRA_TOOL_DEFS);

const byName = new Map();
for (const def of TOOL_DEFS) {
    byName.set(def.name, def);
    for (const a of def.aliases || []) byName.set(String(a).toLowerCase(), def);
}

export function isAgentTool(name) {
    return byName.has(String(name || '').toLowerCase());
}

export function getAgentTool(name) {
    return byName.get(String(name || '').toLowerCase()) || null;
}

export function getToolFlags(name) {
    const t = getAgentTool(name);
    return t ? { parallelSafe: !!t.parallelSafe, untrusted: !!t.untrusted, dangerous: !!t.dangerous, stateful: !!t.stateful } : {};
}

export function listAgentTools(isOwner = false) {
    return TOOL_DEFS.filter(t => isOwner || !t.ownerOnly);
}

export function listAgentToolsForPrompt(isOwner = false) {
    return listAgentTools(isOwner)
        .map(t => {
            const alias = (t.aliases || []).length ? ` (alias: ${t.aliases.join(', ')})` : '';
            const ex = t.examples?.[0] ? ` | example args: "${t.examples[0]}"` : '';
            const par = t.parallelSafe ? ' [read-only: may be batched in "tools"]' : '';
            return `- ${t.name}${alias}: ${t.description}${par}${ex}`;
        })
        .join('\n');
}

export async function runAgentTool(name, args = '', ctx = {}) {
    const tool = getAgentTool(name);
    if (!tool) throw new Error(`Unknown agent tool: ${name}`);
    if (tool.ownerOnly && !ctx.isOwner) throw new Error('This tool is owner-only.');
    return tool.run(String(args || ''), ctx);
}

export const agentToolNames = [...new Set(TOOL_DEFS.flatMap(t => [t.name, ...(t.aliases || [])]))];
