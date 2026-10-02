import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { pathToFileURL } from 'url';
import { config } from '../config.js';
import { getAllFiles, collectMetas } from '../core/loader.js';

const PLUGIN_DIR        = './plugins';
const API_DIR           = './src/lib/api';
const SCAN_ROOTS        = ['src/lib/api', 'src/lib/media', 'src/lib/utils.js', 'src/lib/githubSync.js'];
const PROBE_TIMEOUT     = 8000;
const PROBE_CONCURRENCY = 8;
const PROBE_AGENT       = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const IGNORED_HOSTS = new Set([
    'chat.whatsapp.com',
    'wa.me',
    'www.w3.org',
    'esm.sh',
    'bit.ly',
    'youtu.be',
    'vt.tiktok.com',
    'vm.tiktok.com',
    'i.ytimg.com',
    'github.com'
]);

const OPTIONAL_CONFIG = new Set(['translateEmail']);

const URL_PATTERN    = /(https?):\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi;
const CONFIG_PATTERN = /\bconfig\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g;
const IDENT_PATTERN  = /[A-Za-z_$][\w$]*/g;
const DECL_PATTERN   = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?)\s+([A-Za-z_$][\w$]*)/;
const API_OBJECT     = /^export const \w+Api = \{/;

const STATE_LABEL = { ok: 'ok', restricted: 'dibatasi', down: 'mati', skipped: 'dilewati' };

let infoCache   = new Map();
let exportCache = null;
let memberCache = null;

const toPosix  = (path) => path.split('\\').join('/');
const relative_ = (path) => toPosix(relative(process.cwd(), path));

function isScannable(path) {
    const rel = relative_(path);
    return SCAN_ROOTS.some(root => rel === root || rel.startsWith(`${root}/`));
}

function scannableFiles() {
    return SCAN_ROOTS.flatMap(root => root.endsWith('.js') ? [resolve(root)] : getAllFiles(`./${root}`).map(f => resolve(f)));
}

function stripNoise(text) {
    return text
        .replace(/\bexamples\s*:\s*\[[\s\S]*?\]/g, '')
        .split('\n')
        .filter(line => !/\bexamples\s*:|\.signal\(/.test(line))
        .join('\n');
}

function splitChunks(text) {
    const chunks = new Map();
    let name   = null;
    let buffer = [];

    const flush = () => {
        if (name) chunks.set(name, buffer.join('\n'));
    };

    for (const line of text.split('\n')) {
        const decl = DECL_PATTERN.exec(line);
        if (decl) {
            flush();
            name   = decl[1];
            buffer = [line];
        } else if (name) {
            buffer.push(line);
        }
    }

    flush();
    return chunks;
}

function exportIndex() {
    if (exportCache) return exportCache;
    exportCache = new Map();

    for (const file of scannableFiles()) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
            exportCache.set(m[1], file);
        }
        for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
            for (const part of m[1].split(',')) {
                const name = part.trim().split(/\s+as\s+/).pop();
                if (name) exportCache.set(name, file);
            }
        }
    }

    return exportCache;
}

function parseImports(text, filePath) {
    const imports = new Map();

    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
        const target   = resolve(dirname(filePath), m[2]);
        const isBarrel = toPosix(target).endsWith('/src/lib/index.js');

        for (const part of m[1].split(',')) {
            const [original, local = original] = part.trim().split(/\s+as\s+/);
            if (!original) continue;
            const path = isBarrel ? exportIndex().get(original) : target;
            if (path && isScannable(path)) imports.set(local, { path, name: original });
        }
    }

    return imports;
}

function parseMembers(text) {
    const members = new Map();
    const lines   = text.split('\n');
    const start   = lines.findIndex(line => /^export const \w+Api = \{\s*$/.test(line));
    if (start < 0) return members;

    const body   = lines.slice(start + 1);
    const indent = body.find(line => line.trim())?.match(/^\s*/)[0] ?? '';
    const header = new RegExp(`^${indent}(?:async\\s+)?([A-Za-z_$][\\w$]*)\\s*[:(]`);
    let current  = null;

    for (const line of body) {
        if (line.startsWith('}')) break;
        const m = header.exec(line);
        if (m) {
            current = { name: m[1], lines: [] };
            members.set(m[1], current);
        }
        current?.lines.push(line);
    }

    return new Map([...members].map(([name, member]) => [name, member.lines.join('\n')]));
}

function loadInfo(path) {
    const key = resolve(path);
    if (infoCache.has(key)) return infoCache.get(key);

    let info = null;
    if (existsSync(key)) {
        const text = stripNoise(readFileSync(key, 'utf8'));
        info = {
            path:    key,
            text,
            chunks:  splitChunks(text),
            imports: parseImports(text, key),
            members: parseMembers(text)
        };
    }

    infoCache.set(key, info);
    return info;
}

function apiIndex() {
    if (memberCache) return memberCache;
    memberCache = new Map();

    for (const name of ['llm', 'voice', 'media']) {
        const info = loadInfo(`${API_DIR}/${name}.js`);
        if (!info) continue;
        for (const [member, text] of info.members) memberCache.set(member, { info, text });
    }

    return memberCache;
}

function collect(info, seed, state) {
    state.texts.push(seed);
    const queue = [seed];

    while (queue.length) {
        for (const id of queue.pop().match(IDENT_PATTERN) || []) {
            const key = `${info.path}::${id}`;
            if (state.seen.has(key)) continue;
            state.seen.add(key);

            const chunk = info.chunks.get(id);
            if (chunk && !API_OBJECT.test(chunk)) {
                state.texts.push(chunk);
                queue.push(chunk);
            }

            const imported = info.imports.get(id);
            const target   = imported && loadInfo(imported.path);
            const remote   = target?.chunks.get(imported.name);
            if (remote && !API_OBJECT.test(remote)) collect(target, remote, state);
        }
    }
}

function extractOrigins(text) {
    const origins = new Map();
    for (const m of text.matchAll(URL_PATTERN)) {
        const host = m[2].toLowerCase();
        if (!IGNORED_HOSTS.has(host)) origins.set(host, `${m[1].toLowerCase()}://${host}`);
    }
    return origins;
}

function readConfigPath(path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), config);
}

function extractConfig(text) {
    const paths   = new Set([...text.matchAll(CONFIG_PATTERN)].map(m => m[1]));
    const origins = new Map();
    const missing = [];

    for (const path of paths) {
        if (!(path.split('.')[0] in config)) continue;
        const value = readConfigPath(path);

        if (typeof value === 'string' && /^https?:\/\//.test(value)) {
            const url = new URL(value);
            origins.set(url.host, url.origin);
        } else if (typeof value === 'string' && value && /Host$/.test(path)) {
            origins.set(value, `https://${value}`);
        }

        const empty = value === undefined
            || value === null
            || value === ''
            || (Array.isArray(value) && value.length === 0);

        if (empty && !OPTIONAL_CONFIG.has(path)) missing.push(`config.${path}`);
    }

    return { missing, origins };
}

function analyzeFile(file) {
    const info  = loadInfo(file);
    const state = { seen: new Set(), texts: [] };

    collect(info, info.text, state);

    for (const m of info.text.matchAll(/\bapi\.([A-Za-z_$][\w$]*)/g)) {
        const member = apiIndex().get(m[1]);
        if (member) collect(member.info, member.text, state);
    }

    const text     = state.texts.join('\n');
    const fromText = extractOrigins(text);
    const fromEnv  = extractConfig(text);

    return {
        origins:    [...new Map([...fromText, ...fromEnv.origins]).values()].sort(),
        missingEnv: fromEnv.missing.sort()
    };
}

async function loadPluginFile(file) {
    try {
        const mod   = await import(pathToFileURL(resolve(file)).href);
        const metas = collectMetas(mod);
        if (!metas.length) return { cmds: [], error: 'tidak ada plugin valid (meta.interface.run tidak ditemukan)' };
        return { cmds: metas.flatMap(meta => [meta.interface.cmd].flat().filter(Boolean)), error: null };
    } catch (e) {
        return { cmds: [], error: String(e.message).split('\n')[0] };
    }
}

function describeError(e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'timeout';
    return e.cause?.code || e.cause?.message || e.message;
}

function classifyResponse(res) {
    const { status } = res;
    if (res.headers.get('cf-mitigated') === 'challenge') return { state: 'restricted', detail: `HTTP ${status} (Cloudflare challenge)` };
    if (status === 403 || status === 429) return { state: 'restricted', detail: `HTTP ${status}` };
    if (status >= 500) return { state: 'down', detail: `HTTP ${status}` };
    return { state: 'ok', detail: `HTTP ${status}` };
}

export async function probeOrigin(origin) {
    const started = Date.now();
    try {
        const res = await fetch(origin, {
            method:   'GET',
            redirect: 'follow',
            headers:  { 'user-agent': PROBE_AGENT, accept: '*/*' },
            signal:   AbortSignal.timeout(PROBE_TIMEOUT)
        });
        try { await res.body?.cancel(); } catch {}
        return { ...classifyResponse(res), ms: Date.now() - started };
    } catch (e) {
        return { state: 'down', detail: describeError(e), ms: Date.now() - started };
    }
}

async function probeAll(origins) {
    const results = new Map();
    const queue   = [...origins];

    const worker = async () => {
        while (queue.length) {
            const origin = queue.shift();
            results.set(origin, await probeOrigin(origin));
        }
    };

    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, worker));
    return results;
}

function resolveLevel(entry, probes) {
    if (entry.error) return 'error';

    const states = entry.origins.map(origin => probes.get(origin)?.state).filter(Boolean);
    if (states.length && states.every(state => state === 'down')) return 'down';
    if (states.some(state => state === 'down' || state === 'restricted')) return 'warn';
    if (entry.missingEnv.length) return 'warn';
    return 'ok';
}

function findCollisions(entries) {
    const owners = new Map();
    for (const entry of entries) {
        for (const cmd of entry.cmds) {
            if (!owners.has(cmd)) owners.set(cmd, new Set());
            owners.get(cmd).add(entry.file);
        }
    }
    return [...owners]
        .filter(([, files]) => files.size > 1)
        .map(([cmd, files]) => ({ cmd, files: [...files] }));
}

export async function checkPlugins({ only = null, probe = true } = {}) {
    infoCache   = new Map();
    exportCache = null;
    memberCache = null;

    const needle  = only ? only.toLowerCase() : null;
    const entries = [];

    for (const file of getAllFiles(PLUGIN_DIR).sort()) {
        const loaded = await loadPluginFile(file);
        entries.push({
            file: toPosix(relative(PLUGIN_DIR, file)),
            ...loaded,
            ...analyzeFile(file)
        });
    }

    const collisions = findCollisions(entries);
    const selected   = needle
        ? entries.filter(entry => entry.file.toLowerCase().includes(needle) || entry.cmds.includes(needle))
        : entries;

    const origins = [...new Set(selected.flatMap(entry => entry.origins))];
    const probes  = probe ? await probeAll(origins) : new Map(origins.map(origin => [origin, { state: 'skipped', detail: 'tidak dicek' }]));

    for (const entry of selected) entry.level = resolveLevel(entry, probes);

    return { files: selected, probes, collisions, probed: probe };
}

function describeEntry(entry, report) {
    const cmds  = entry.cmds.length ? ` (${entry.cmds.join(', ')})` : '';
    const lines = [`• ${entry.file}${cmds}`];

    if (entry.error) lines.push(`  ↳ ${entry.error}`);
    for (const env of entry.missingEnv) lines.push(`  ↳ env kosong: ${env}`);
    for (const origin of entry.origins) {
        const probe = report.probes.get(origin);
        if (probe && !['ok', 'skipped'].includes(probe.state)) {
            lines.push(`  ↳ ${new URL(origin).host}: ${STATE_LABEL[probe.state]} — ${probe.detail}`);
        }
    }

    return lines.join('\n');
}

export function formatReport(report, { full = false, bold = (text) => `*${text}*` } = {}) {
    const groups = { error: [], down: [], warn: [], ok: [] };
    for (const entry of report.files) groups[entry.level].push(entry);

    const commandCount = report.files.reduce((n, entry) => n + entry.cmds.length, 0);
    const out = [
        `🔎 ${bold('Plugin Check')}`,
        `${report.files.length} file · ${commandCount} command · ${report.probes.size} host API${report.probed ? '' : ' (tidak dicek)'}`,
        `✅ ${groups.ok.length}  ⚠️ ${groups.warn.length}  🔴 ${groups.down.length}  ❌ ${groups.error.length}`
    ];

    const sections = [
        ['error', `❌ ${bold('Error kode')}`],
        ['down', `🔴 ${bold('API mati')}`],
        ['warn', `⚠️ ${bold('Perlu dicek')}`]
    ];

    for (const [level, title] of sections) {
        if (!groups[level].length) continue;
        out.push('', title, ...groups[level].map(entry => describeEntry(entry, report)));
    }

    if (report.collisions.length) {
        out.push('', `⚠️ ${bold('Command bentrok')}`);
        for (const { cmd, files } of report.collisions) out.push(`• ${cmd}: ${files.join(', ')}`);
    }

    if (full && groups.ok.length) {
        out.push('', `✅ ${bold('Normal')}`, groups.ok.map(entry => entry.file).join(', '));
    }

    if (report.probed) {
        out.push('', '_Cek API hanya memastikan host merespons, bukan memastikan hasil scrape masih valid._');
    }

    return out.join('\n');
}
