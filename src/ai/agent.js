import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { plugins, reloadPlugins } from '../core/loader.js';
import { checkPlugins, formatReport } from '../tools/pluginCheck.js';
import { logger, downloadMedia } from '../util/index.js';

const run = promisify(execFile);

const ROOT = process.cwd();
const WRITE_ROOTS = ['plugins', 'src', 'scripts'];
const WRITE_EXT = new Set(['.js', '.txt', '.json']);
const DENY = /(^|\/)(\.env[^/]*|node_modules|session[^/]*|\.git)(\/|$)/;
const MAX_OUT = 3500;
const TEST_TIMEOUT = 20000;

const OUT_DIR = path.join(ROOT, 'tmp', 'agent-out');
const OUT_EXT = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.cjs': 'text/javascript',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.py': 'text/x-python',
    '.html': 'text/html',
    '.css': 'text/css',
    '.ts': 'text/plain',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.csv': 'text/csv'
};
const MAX_OUT_FILE = 400000;
const MAX_SOURCE = 24000;

const backups = new Map();

const clip = (value, limit = MAX_OUT) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]` : text;
};

const safePath = (input, { write = false } = {}) => {
    const abs = path.resolve(ROOT, String(input || ''));
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('path outside project folder');
    if (DENY.test(rel)) throw new Error('path is blocked');
    if (write) {
        if (!WRITE_ROOTS.includes(rel.split('/')[0])) throw new Error('write allowed only in plugins/, src/, scripts/');
        if (!WRITE_EXT.has(path.extname(rel))) throw new Error('file type not writable');
    }
    return { abs, rel };
};

const checkSyntax = async (abs) => {
    try {
        await run(process.execPath, ['--check', abs], { timeout: 10000 });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: clip(e.stderr || e.message, 1500) };
    }
};

const makeMockSock = (sent) => new Proxy({}, {
    get: (_, key) => {
        if (key === 'then') return undefined;
        if (key === 'sendMessage') return async (jid, content) => {
            sent.push(content);
            return { key: { id: 'mock' } };
        };
        return async () => ({});
    }
});

const tools = {
    async list_files({ dir = '.' }) {
        const { abs, rel } = safePath(dir);
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return entries
            .filter(e => !DENY.test(`${rel}/${e.name}`))
            .map(e => (e.isDirectory() ? `${e.name}/` : e.name));
    },

    async read_file({ path: file, from = 1, to = 200 }) {
        const { abs } = safePath(file);
        const lines = (await fs.readFile(abs, 'utf8')).split('\n');
        const start = Math.max(1, Number(from) || 1);
        const end = Math.min(lines.length, Number(to) || start + 199, start + 299);
        return {
            total_lines: lines.length,
            from: start,
            to: end,
            content: lines.slice(start - 1, end).map((l, i) => `${start + i}| ${l}`).join('\n')
        };
    },

    async grep_code({ pattern, dir = '.' }) {
        const needle = String(pattern || '').toLowerCase();
        if (needle.length < 2) return { ok: false, error: 'pattern too short' };
        const { abs: start } = safePath(dir);
        const hits = [];
        const walk = async (current) => {
            if (hits.length >= 40) return;
            const entries = await fs.readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                if (hits.length >= 40) return;
                const full = path.join(current, entry.name);
                const rel = path.relative(ROOT, full).split(path.sep).join('/');
                if (DENY.test(rel) || DENY.test(`${rel}/`)) continue;
                if (entry.isDirectory()) {
                    await walk(full);
                    continue;
                }
                if (!['.js', '.txt', '.json', '.md'].includes(path.extname(rel))) continue;
                const lines = (await fs.readFile(full, 'utf8')).split('\n');
                for (let i = 0; i < lines.length && hits.length < 40; i++) {
                    if (lines[i].toLowerCase().includes(needle)) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
                }
            }
        };
        await walk(start);
        return { count: hits.length, hits };
    },

    async check_syntax({ path: file }) {
        const { abs } = safePath(file);
        return checkSyntax(abs);
    },

    async patch_file({ path: file, find, replace }) {
        const { abs, rel } = safePath(file, { write: true });
        if (typeof find !== 'string' || !find || typeof replace !== 'string') throw new Error('find and replace are required');
        const original = await fs.readFile(abs, 'utf8');
        const count = original.split(find).length - 1;
        if (count !== 1) return { ok: false, error: `find text matched ${count} times, must match exactly once` };
        if (!backups.has(rel)) backups.set(rel, original);
        await fs.writeFile(abs, original.replace(find, replace));
        const syntax = await checkSyntax(abs);
        if (!syntax.ok) {
            await fs.writeFile(abs, original);
            return { ok: false, rolled_back: true, error: syntax.error };
        }
        if (rel.startsWith('plugins/')) await reloadPlugins();
        return { ok: true, file: rel };
    },

    async test_plugin({ command, args = '' }) {
        const plugin = plugins.get(String(command || '').toLowerCase());
        if (!plugin) return { ok: false, error: `command "${command}" not found` };
        const sent = [];
        const body = args ? `${command} ${args}` : String(command);
        const ctx = {
            body,
            command,
            message: { body, key: {}, quoted: null },
            raw: { key: { id: 'mock' }, message: {} },
            from: 'agent-test@s.whatsapp.net',
            primaryId: 'agent-test',
            pushname: 'agent',
            isOwner: true,
            isAdmin: true,
            isGroup: false,
            db: { lang: 'en', users: {}, groups: {}, settings: {} },
            saveDb: async () => {},
            reply: async (text) => { sent.push({ text }); },
            typing: async () => {},
        };
        try {
            await Promise.race([
                plugin.run(makeMockSock(sent), ctx),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TEST_TIMEOUT))
            ]);
            return { ok: true, output: clip(sent, 1500) };
        } catch (e) {
            return { ok: false, error: e.message, stack: clip(String(e.stack || '').split('\n').slice(0, 6).join('\n'), 800), output: clip(sent, 800) };
        }
    },

    async run_checker({ only = null, probe = false }) {
        const report = await checkPlugins({ only, probe: probe === true });
        return formatReport(report, { full: false, bold: (text) => text });
    },

    async rollback({ path: file }) {
        const { abs, rel } = safePath(file, { write: true });
        if (!backups.has(rel)) return { ok: false, error: 'no backup for this file' };
        await fs.writeFile(abs, backups.get(rel));
        backups.delete(rel);
        if (rel.startsWith('plugins/')) await reloadPlugins();
        return { ok: true, file: rel };
    },
};

const validateOutput = async (abs, ext) => {
    if (['.js', '.mjs', '.cjs'].includes(ext)) return checkSyntax(abs);
    if (ext === '.json') {
        try {
            JSON.parse(await fs.readFile(abs, 'utf8'));
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }
    if (ext === '.py') {
        try {
            await run('python3', ['-m', 'py_compile', abs], { timeout: 10000 });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: clip(e.stderr || e.message, 1500) };
        }
    }
    return { ok: true };
};

const makeOutputTools = ({ sock, from, quoted }) => {
    const ready = new Set();

    return {
        async create_output({ name, content }) {
            const base = path.basename(String(name || ''));
            const ext = path.extname(base).toLowerCase();
            if (!base || base.startsWith('.') || !OUT_EXT[ext]) return { ok: false, error: `name must end with one of ${Object.keys(OUT_EXT).join(' ')}` };
            if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'content is empty' };
            if (content.length > MAX_OUT_FILE) return { ok: false, error: 'content too large' };
            await fs.mkdir(OUT_DIR, { recursive: true });
            const abs = path.join(OUT_DIR, base);
            await fs.writeFile(abs, content);
            const check = await validateOutput(abs, ext);
            if (!check.ok) {
                await fs.rm(abs, { force: true });
                ready.delete(base);
                return { ok: false, error: check.error };
            }
            ready.add(base);
            return { ok: true, name: base, bytes: Buffer.byteLength(content) };
        },

        async send_source({ path: file }) {
            const { abs, rel } = safePath(file);
            const ext = path.extname(rel).toLowerCase();
            if (!OUT_EXT[ext]) return { ok: false, error: 'file type not sendable' };
            if (!sock || !from) return { ok: false, error: 'no chat to send to' };
            const buffer = await fs.readFile(abs);
            if (buffer.length > MAX_OUT_FILE) return { ok: false, error: 'file too large' };
            await sock.sendMessage(from, {
                document: buffer,
                mimetype: OUT_EXT[ext],
                fileName: path.basename(rel)
            }, quoted ? { quoted } : {});
            return { ok: true, sent: rel };
        },

        async send_file({ name }) {
            const base = path.basename(String(name || ''));
            if (!ready.has(base)) return { ok: false, error: 'file not created or did not pass validation' };
            if (!sock || !from) return { ok: false, error: 'no chat to send to' };
            const abs = path.join(OUT_DIR, base);
            const buffer = await fs.readFile(abs);
            await sock.sendMessage(from, {
                document: buffer,
                mimetype: OUT_EXT[path.extname(base).toLowerCase()],
                fileName: base
            }, quoted ? { quoted } : {});
            await fs.rm(abs, { force: true });
            ready.delete(base);
            return { ok: true, sent: base };
        }
    };
};

export async function readAttachment(raw, m) {
    if (!m?.quoted) return '';
    try {
        const doc = await downloadMedia(raw, m.quoted, ['document']);
        if (doc?.buffer) {
            const name = doc.fileName || doc.filename || 'input';
            return `\n\n[ATTACHED FILE ${name}, ${doc.buffer.length} bytes, first ${MAX_SOURCE} chars shown]\n${doc.buffer.toString('utf8').slice(0, MAX_SOURCE)}`;
        }
    } catch {
        return '';
    }
    if (m.quoted.text) return `\n\n[QUOTED TEXT]\n${String(m.quoted.text).slice(0, MAX_SOURCE)}`;
    return '';
}

export function makeToolRunner({ isOwner, sock, from, quoted }) {
    if (isOwner !== true) return null;
    const toolset = { ...tools, ...makeOutputTools({ sock, from, quoted }) };

    return async (name, args) => {
        if (!Object.hasOwn(toolset, name)) return `unknown tool "${name}"`;
        let result;
        try {
            result = await toolset[name](args);
        } catch (e) {
            result = { ok: false, error: e.message };
        }
        logger.info(`[agent] ${name}`);
        return clip(result);
    };
}

export const agentRollback = (file) => tools.rollback({ path: file });
