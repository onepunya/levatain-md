import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { downloadAttachment } from './attachments.js';
import { unwrapMessage } from '../core/identity.js';
import { safeFileName } from '../api/gemini-upload.js';

const MAX_IMAGES = 4;
const MAX_URLS = 2;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const URL_TIMEOUT_MS = 10_000;
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;

const mimeOf = (value) => String(value || '').split(';')[0].trim().toLowerCase();

export function sniffMime(buf) {
    if (!buf || buf.length < 12) return '';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return '';
}

const mapV4 = (ip) => {
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    return m ? m[1] : ip;
};

export function isPrivateIp(raw) {
    const ip = mapV4(String(raw || '').replace(/^\[|\]$/g, ''));
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 192 && b === 0)
            || (a === 198 && (b === 18 || b === 19));
    }
    if (net.isIPv6(ip)) {
        const low = ip.toLowerCase();
        return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^fe[89ab]/.test(low) || /^ff/.test(low);
    }
    return true;
}

const guardedLookup = (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err);
        const ok = addrs.filter(a => !isPrivateIp(a.address));
        if (!ok.length) return cb(new Error('alamat diblokir'));
        if (options && options.all) return cb(null, ok);
        return cb(null, ok[0].address, ok[0].family);
    });
};

function getOnce(url, allowPrivate) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(url); } catch { return reject(new Error('url tidak valid')); }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('protokol tidak didukung'));
        if (u.port && u.port !== '80' && u.port !== '443' && !allowPrivate) return reject(new Error('port tidak diizinkan'));
        const host = u.hostname.replace(/^\[|\]$/g, '');
        if (!allowPrivate && net.isIP(host) && isPrivateIp(host)) return reject(new Error('alamat diblokir'));

        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.get(u, {
            headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137.0.0.0 Mobile Safari/537.36', accept: 'image/*,*/*;q=0.5' },
            ...(allowPrivate ? {} : { lookup: guardedLookup }),
        }, resolve);
        const timer = setTimeout(() => req.destroy(new Error('timeout')), URL_TIMEOUT_MS);
        req.on('error', (e) => { clearTimeout(timer); reject(e); });
        req.on('close', () => clearTimeout(timer));
    });
}

export async function fetchImageUrl(url, { allowPrivate = false } = {}) {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await getOnce(current, allowPrivate);
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            current = new URL(res.headers.location, current).toString();
            continue;
        }
        if (status !== 200) { res.resume(); return null; }
        const type = mimeOf(res.headers['content-type']);
        const declared = Number(res.headers['content-length'] || 0);
        if ((type && !type.startsWith('image/') && type !== 'application/octet-stream') || declared > MAX_IMAGE_BYTES) {
            res.destroy();
            return null;
        }
        const chunks = [];
        let total = 0;
        const buffer = await new Promise((resolve) => {
            res.on('data', (c) => {
                total += c.length;
                if (total > MAX_IMAGE_BYTES) { res.destroy(); return resolve(null); }
                chunks.push(c);
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', () => resolve(null));
            res.on('close', () => resolve(total <= MAX_IMAGE_BYTES ? Buffer.concat(chunks) : null));
        });
        if (!buffer) return null;
        const mimetype = sniffMime(buffer);
        if (!MIME_OK.has(mimetype)) return null;
        return { buffer, mimetype };
    }
    return null;
}

function isViewOnce(msg) {
    let cur = msg;
    for (let i = 0; i < 5 && cur; i++) {
        if (VIEW_ONCE_KEYS.some(k => cur[k])) return true;
        cur = cur.ephemeralMessage?.message || cur.documentWithCaptionMessage?.message || cur.editedMessage?.message || null;
    }
    return false;
}

function imageAttachmentsOf(msg) {
    const inner = unwrapMessage(msg);
    if (!inner || isViewOnce(msg)) return [];
    const found = [];
    const push = (media, kind) => {
        if (!media || media.viewOnce) return;
        const mimetype = mimeOf(media.mimetype);
        if (!MIME_OK.has(mimetype)) return;
        if (kind === 'sticker' && media.isAnimated) return;
        const size = Number(media.fileLength?.low ?? media.fileLength ?? 0);
        if (size > MAX_IMAGE_BYTES) return;
        found.push({ media, kind, size, mimetype });
    };
    push(inner.imageMessage, 'image');
    push(inner.stickerMessage, 'sticker');
    const doc = inner.documentMessage;
    if (doc && mimeOf(doc.mimetype).startsWith('image/')) push(doc, 'document');
    return found;
}

const urlsIn = (text) => {
    const seen = new Set();
    for (const raw of String(text || '').match(URL_RE) || []) {
        const url = raw.replace(/[.,;:!?]+$/, '');
        seen.add(url);
        if (seen.size >= MAX_URLS) break;
    }
    return [...seen];
};

export async function collectImages(m, text = '') {
    const images = [];
    const add = (buffer, mimetype, name) => {
        if (images.length >= MAX_IMAGES || !buffer?.length || buffer.length > MAX_IMAGE_BYTES) return;
        const base = safeFileName(name).replace(/\.[A-Za-z0-9]+$/, '') || 'image';
        images.push({ buffer, mimetype, filename: `${base}.${EXT_BY_MIME[mimetype]}`, path: null });
    };

    const sources = [m?.raw?.message, m?.quoted?.raw?.message];
    for (const msg of sources) {
        for (const att of imageAttachmentsOf(msg)) {
            if (images.length >= MAX_IMAGES) break;
            try {
                const buffer = await downloadAttachment(att);
                add(buffer, sniffMime(buffer) || att.mimetype, `${att.kind}-${images.length + 1}`);
            } catch {}
        }
    }

    const urls = urlsIn(`${text} ${m?.quoted?.text || ''}`);
    const fetched = await Promise.all(urls.map(u => fetchImageUrl(u).catch(() => null)));
    fetched.forEach((img, i) => { if (img) add(img.buffer, img.mimetype, `url-${i + 1}`); });

    return images;
}

export const visionNote = (images) => (images && images.length
    ? `[${images.length} gambar (foto, stiker, atau link gambar) ikut terlampir langsung ke kamu — lihat dan jelaskan sendiri isinya, tidak perlu tool untuk melihatnya]`
    : '');
