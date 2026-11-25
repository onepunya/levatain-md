import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const BASE = 'https://gemini.google.com';
const STREAM_PATH = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const FALLBACK_BL = 'boq_assistant-bard-web-server_20260912.08_p0';
const FALLBACK_SID = '-4966488158871472830';

const TTL_MS = 6 * 60 * 60 * 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', '..', '.levatain');
const CACHE_FILE = path.join(CACHE_DIR, 'gemini-session.json');

let mem = null;
let pending = null;
let reqCounter = Math.floor(Math.random() * 900000) + 100000;

const cookieKey = (cookie) => crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 16);

const isFresh = (s, key) => s && s.key === key && s.snlm0e && Date.now() - s.fetchedAt < TTL_MS;

const readCache = (key) => {
    try {
        const d = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (isFresh(d, key)) return d;
    } catch {}
    return null;
};

const writeCache = (data) => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data), { mode: 0o600 });
    } catch {}
};

const handshake = async (cookie, key) => {
    const res = await fetch(`${BASE}/app`, {
        headers: {
            cookie,
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Handshake HTTP ${res.status}`);
    const html = await res.text();
    const pick = (re) => html.match(re)?.[1] || '';

    const snlm0e = pick(/"SNlM0e":"([^"]+)"/);
    if (!snlm0e) throw new Error('Token SNlM0e tidak ditemukan (cookie kedaluwarsa / belum login)');

    return {
        key,
        snlm0e,
        buildLabel: pick(/"cfb2h":"([^"]+)"/) || pick(/"bl":"([^"]+)"/) || FALLBACK_BL,
        sid: pick(/"FdrFJe":"([^"]+)"/) || FALLBACK_SID,
        fetchedAt: Date.now(),
    };
};

export const invalidateSession = () => {
    mem = null;
    try { fs.unlinkSync(CACHE_FILE); } catch {}
};

export const getSession = async (cookie, force = false) => {
    const key = cookieKey(cookie);
    if (!force) {
        if (isFresh(mem, key)) return mem;
        const cached = readCache(key);
        if (cached) return (mem = cached);
    }
    if (!pending) {
        pending = handshake(cookie, key)
            .then((s) => { mem = s; writeCache(s); return s; })
            .finally(() => { pending = null; });
    }
    return pending;
};

const cleanText = (text) => String(text || '')
    .replace(/\n*https?:\/\/googleusercontent\.com\/\w+_content\/[^\s]+/g, '')
    .trim();

export const parseStream = (rawText) => {
    let best = '';
    for (const line of String(rawText || '').split('\n')) {
        const t = line.trim();
        if (!t.startsWith('[') || !t.includes('"wrb.fr"')) continue;
        try {
            const outer = JSON.parse(t);
            if (!Array.isArray(outer)) continue;
            for (const item of outer) {
                if (!Array.isArray(item) || item[0] !== 'wrb.fr' || typeof item[2] !== 'string') continue;
                const inner = JSON.parse(item[2]);
                const cands = Array.isArray(inner?.[4]) ? inner[4] : [];
                for (const cand of cands) {
                    const txt = cand?.[1]?.[0];
                    
                    if (typeof txt === 'string' && txt.length > best.length) best = txt;
                }
            }
        } catch {}
    }
    return cleanText(best);
};

const httpError = (message, { status, retryable = false } = {}) => {
    const err = new Error(message);
    err.status = status;
    err.retryable = retryable;
    return err;
};

const requestOnce = async (cookie, session, promptText, files) => {
    const url = new URL(BASE + STREAM_PATH);
    url.searchParams.set('bl', session?.buildLabel || FALLBACK_BL);
    url.searchParams.set('f.sid', session?.sid || FALLBACK_SID);
    url.searchParams.set('hl', 'id');
    url.searchParams.set('_reqid', String((reqCounter += 100000)));
    url.searchParams.set('rt', 'c');

    const inner = [
        [promptText, 0, null, files?.length ? files : null, null, null, 0],
        ['id'],
        ['', '', '', null, null, null, null, null, null, ''],
    ];
    const body = new URLSearchParams();
    body.append('f.req', JSON.stringify([null, JSON.stringify(inner)]));
    if (session?.snlm0e) body.append('at', session.snlm0e);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            authority: 'gemini.google.com',
            accept: '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            origin: BASE,
            referer: `${BASE}/`,
            'user-agent': USER_AGENT,
            'x-same-domain': '1',
            cookie,
        },
        body,
        signal: AbortSignal.timeout(45_000),
    });

    if (res.status === 429 || res.status === 402) throw httpError('Rate limit tercapai.', { status: res.status });
    if (!res.ok) {       
        throw httpError(`HTTP Error ${res.status}`, { status: res.status, retryable: [400, 401, 403].includes(res.status) });
    }

    const text = parseStream(await res.text());
    if (!text) throw httpError('Failed to retrieve reply text', { retryable: true });
    return text;
};
export const geminiGenerate = async ({ cookie, promptText, files = [] }) => {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        let session = null;
        try {
            session = await getSession(cookie, attempt > 0);
        } catch (e) {
            console.warn(`[gemini-session] handshake gagal (${e.message}), pakai mode lama`);
        }
        try {
            return await requestOnce(cookie, session, promptText, files);
        } catch (e) {
            lastErr = e;
            if (attempt === 0 && e.retryable) {
                invalidateSession();
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
};
