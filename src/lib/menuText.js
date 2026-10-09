import fs from 'fs';
import os from 'os';
import path from 'path';
import { api } from './api/index.js';
import { logger } from './logger.js';

const STORE = path.join(os.homedir(), '.levatain', 'menu-text.json');
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const POOL_MAX = 24;
const MIN_POOL = 3;
const CHUNK_BUDGET = 16;

const slots = new Map();
let pool = {};
let updatedAt = 0;
let inflight = null;
let nextTryAt = 0;
const lastPick = new Map();

try {
    const saved = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    pool = saved.pool || {};
    updatedAt = saved.updatedAt || 0;
} catch {}

function persist() {
    try {
        fs.mkdirSync(path.dirname(STORE), { recursive: true });
        fs.writeFileSync(STORE, JSON.stringify({ updatedAt, pool }, null, 2));
    } catch (e) {
        logger.warn(`[menuText] failed to save cache: ${e.message}`);
    }
}

export function registerSlots(defs) {
    for (const [key, def] of Object.entries(defs)) {
        slots.set(key, { count: 6, max: 80, ...def });
    }
}

function clean(list, def) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
        if (typeof raw !== 'string') continue;
        const s = raw.replace(/\s*\n+\s*/g, ' ').replace(/`/g, '').trim();
        if (s.length < 3 || s.length > def.max) continue;
        if (def.must && !(typeof def.must === 'function' ? def.must(s) : def.must.test(s))) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return out;
}

function parseJson(text) {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

function chunkKeys() {
    const chunks = [];
    let cur = [];
    let total = 0;
    for (const [key, def] of slots) {
        if (cur.length && total + def.count > CHUNK_BUDGET) {
            chunks.push(cur);
            cur = [];
            total = 0;
        }
        cur.push(key);
        total += def.count;
    }
    if (cur.length) chunks.push(cur);
    return chunks;
}

async function generateChunk(keys) {
    const system =
        `You write menu text for a WhatsApp bot named "${global.botName || 'Levatain-MD'}". ` +
        'Style: casual English, warm, short, one emoji per sentence is fine. ' +
        'Do not mention the user name. No line breaks. ' +
        'Reply with ONLY valid JSON — no explanation, no code fence.';

    const spec = keys.map(k => {
        const d = slots.get(k);
        return `- "${k}": ${d.count} different variations, max ${d.max} characters. ${d.desc}`;
    }).join('\n');

    const user = `Write text variations for the following slots. Format: {"slot":["text1","text2"]}\n${spec}`;
    const res = await api.chatAI([{ role: 'user', content: user }], system);
    const json = parseJson(res);
    if (!json) throw new Error('LLM response is not JSON');

    let ok = 0;
    for (const k of keys) {
        const fresh = clean(json[k], slots.get(k));
        if (!fresh.length) continue;
        const merged = [...fresh, ...(pool[k] || [])];
        pool[k] = [...new Set(merged)].slice(0, POOL_MAX);
        ok++;
    }
    return ok;
}

export function refreshMenuText({ force = false } = {}) {
    if (inflight) return inflight;
    if (!force && Date.now() < nextTryAt) return Promise.resolve({ ok: false, slots: 0, error: 'waiting for retry cooldown' });

    inflight = (async () => {
        let okTotal = 0;
        let lastErr = null;
        for (const keys of chunkKeys()) {
            try {
                okTotal += await generateChunk(keys);
            } catch (e) {
                lastErr = e.message;
                logger.warn(`[menuText] chunk failed: ${e.message}`);
            }
        }
        if (okTotal) {
            updatedAt = Date.now();
            persist();
            logger.info?.(`[menuText] pool updated (${okTotal} slots)`);
        }
        if (!okTotal || lastErr) nextTryAt = Date.now() + RETRY_MS;
        inflight = null;
        return { ok: okTotal > 0, slots: okTotal, error: lastErr };
    })();
    return inflight;
}

export function ensureMenuText() {
    if (Date.now() - updatedAt > TTL_MS || !Object.keys(pool).length) refreshMenuText().catch(() => {});
}

export function menuTextStatus() {
    const filled = [...slots.keys()].filter(k => pool[k]?.length).length;
    return { filled, total: slots.size, updatedAt, sample: pool.greet_pagi?.[0] || null };
}

function needsRefresh(key) {
    if (Date.now() - updatedAt > TTL_MS) return true;
    return (pool[key]?.length || 0) < MIN_POOL;
}

export function pickText(key, fallback = '') {
    if (needsRefresh(key)) refreshMenuText().catch(() => {});

    const list = pool[key];
    if (!list?.length) return fallback;

    let choice = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && choice === lastPick.get(key)) {
        choice = list[(list.indexOf(choice) + 1) % list.length];
    }
    lastPick.set(key, choice);
    return choice;
}
