import dns from 'dns/promises';
import net from 'net';

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 15_000;
const PAGE_CHARS = 6000;
let lookup = (host) => dns.lookup(host, { all: true });
export const setResolver = (fn) => { lookup = fn || ((host) => dns.lookup(host, { all: true })); };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TEXT_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml|rss\+xml|atom\+xml|ld\+json))/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };

export function decodeEntities(text) {
    return String(text || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => safeFromCode(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function safeFromCode(n) {
    try {
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    } catch {
        return '';
    }
}

function ipv4ToInt(ip) {
    return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_PRIVATE = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

export function isPrivateIp(ip) {
    const addr = String(ip || '').trim().toLowerCase();
    if (net.isIPv4(addr)) {
        const n = ipv4ToInt(addr);
        return V4_PRIVATE.some(([base, bits]) => {
            const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
            return (n & mask) === (ipv4ToInt(base) & mask);
        });
    }
    if (net.isIPv6(addr)) {
        if (addr === '::' || addr === '::1') return true;
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
        if (mapped) return isPrivateIp(mapped[1]);
        return /^(fc|fd|fe[89ab])/.test(addr) || addr.startsWith('ff');
    }
    return true;
}

export async function assertPublicUrl(rawUrl) {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('Invalid URL.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed.');
    if (url.username || url.password) throw new Error('URLs with credentials are not allowed.');
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new Error('Local addresses are blocked.');
    }
    if (net.isIP(host)) {
        if (isPrivateIp(host)) throw new Error('Private network addresses are blocked.');
        return url;
    }
    let records;
    try {
        records = await lookup(host);
    } catch {
        throw new Error(`Cannot resolve host: ${host}`);
    }
    if (!records.length || records.some(r => isPrivateIp(r.address))) {
        throw new Error('Host resolves to a private network address (blocked).');
    }
    return url;
}

async function readLimited(res, max) {
    if (!res.body) return Buffer.alloc(0);
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
        total += chunk.length;
        if (total > max) {
            chunks.push(chunk.subarray(0, chunk.length - (total - max)));
            break;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export async function safeFetch(rawUrl, { method = 'GET', headers = {}, body, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
    let url = await assertPublicUrl(rawUrl);
    let currentMethod = method;
    let currentBody = body;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetch(url, {
            method: currentMethod,
            headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5', 'accept-language': 'id,en;q=0.8', ...headers },
            body: currentBody,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
            if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
                currentMethod = 'GET';
                currentBody = undefined;
            }
            continue;
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType && !TEXT_TYPES.test(contentType)) {
            throw new Error(`Unsupported content type: ${contentType.split(';')[0]}`);
        }
        const buf = await readLimited(res, maxBytes);
        return { status: res.status, ok: res.ok, url: url.href, contentType, text: buf.toString('utf8') };
    }
    throw new Error('Too many redirects.');
}

const DROP_BLOCKS = ['script', 'style', 'noscript', 'svg', 'template', 'canvas', 'form', 'nav', 'footer', 'header', 'aside', 'button', 'select'];
const BLOCK_TAGS = 'p|div|section|article|main|li|ul|ol|tr|table|h[1-6]|br|hr|blockquote|pre|figure|figcaption|dt|dd|details|summary';

export function htmlToText(html) {
    let s = String(html || '');
    const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(s)?.[1] || '').replace(/\s+/g, ' ').trim());
    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
    for (const tag of DROP_BLOCKS) s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
    const main = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(s);
    if (main && main[2].replace(/<[^>]+>/g, '').trim().length > 400) s = main[2];
    else {
        const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(s);
        if (body) s = body[1];
    }
    s = s.replace(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_, href, label) => {
        const text = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!text) return '';
        return /^https?:\/\//i.test(href) && text.length < 90 ? `${text} (${href})` : text;
    });
    s = s.replace(new RegExp(`<\\/?(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeEntities(s)
        .replace(/[ \t\f\v\u00a0]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { title, text: s };
}
export function extractPageAssets(html, baseUrl = '') {
    const src = String(html || '');
    let base;
    try { base = baseUrl ? new URL(baseUrl) : null; } catch { base = null; }
    const abs = (href) => {
        try {
            if (!href || /^(javascript|mailto|tel|data|blob):/i.test(href)) return '';
            const u = base ? new URL(href, base) : new URL(href);
            if (!['http:', 'https:'].includes(u.protocol)) return '';
            return u.href;
        } catch { return ''; }
    };

    const links = [];
    const linkSeen = new Set();
    const linkRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(src)) && links.length < 50) {
        const href = abs(decodeEntities(m[1]));
        if (!href || linkSeen.has(href)) continue;
        linkSeen.add(href);
        const label = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80);
        links.push({ url: href, title: label });
    }

    const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i;
    const VID_EXT = /\.(mp4|webm|mkv|mov|m4v|ogv)(\?|$)/i;
    const AUD_EXT = /\.(mp3|ogg|opus|wav|m4a|aac|flac)(\?|$)/i;
    const FILE_EXT = /\.(pdf|zip|rar|7z|tar|gz|doc|docx|xls|xlsx|ppt|pptx|csv|txt|json|xml|apk|exe|dmg|iso|rtf|odt)(\?|$)/i;

    const images = [];
    const videos = [];
    const audio = [];
    const files = [];
    const seen = new Set();

    const push = (list, url, meta = {}) => {
        const u = abs(decodeEntities(url || ''));
        if (!u || seen.has(u)) return;
        seen.add(u);
        list.push({ url: u, ...meta });
    };

    const imgRe = /<img\b([^>]*)>/gi;
    while ((m = imgRe.exec(src)) && images.length < 40) {
        const attrs = m[1] || '';
        const get = (name) => {
            const mm = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
            return mm ? mm[1] : '';
        };
        const alt = get('alt');
        const srcset = get('srcset');
        if (srcset) {
            const last = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
            if (last) push(images, last, { alt: decodeEntities(alt).slice(0, 80), kind: 'image' });
        }
        push(images, get('src') || get('data-src') || get('data-original') || get('data-full'), {
            alt: decodeEntities(alt).slice(0, 80),
            kind: 'image',
        });
    }
    const mediaTagRe = /<(video|audio)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    while ((m = mediaTagRe.exec(src))) {
        const tag = m[1].toLowerCase();
        const attrs = m[2] || '';
        const inner = m[3] || '';
        const list = tag === 'video' ? videos : audio;
        const srcAttr = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
        if (srcAttr) push(list, srcAttr, { kind: tag });
        const sourceRe = /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
        let sm;
        while ((sm = sourceRe.exec(inner))) push(list, sm[1], { kind: tag });
    }
    const looseMediaRe = /<(?:video|audio|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = looseMediaRe.exec(src))) {
        const u = m[1];
        if (VID_EXT.test(u)) push(videos, u, { kind: 'video' });
        else if (AUD_EXT.test(u)) push(audio, u, { kind: 'audio' });
        else push(videos, u, { kind: 'media' });
    }  
    const embedRe = /<(?:embed|object|iframe)\b([^>]*)>/gi;
    while ((m = embedRe.exec(src)) && files.length < 30) {
        const attrs = m[1] || '';
        const get = (name) => {
            const mm = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
            return mm ? mm[1] : '';
        };
        const u = get('src') || get('data') || get('href');
        if (!u) continue;
        if (VID_EXT.test(u)) push(videos, u, { kind: 'video' });
        else if (AUD_EXT.test(u)) push(audio, u, { kind: 'audio' });
        else if (FILE_EXT.test(u) || IMG_EXT.test(u)) push(FILE_EXT.test(u) ? files : images, u, { kind: FILE_EXT.test(u) ? 'file' : 'image' });
    }
    for (const l of links) {
        const u = l.url;
        const title = l.title || '';
        if (IMG_EXT.test(u)) push(images, u, { alt: title, kind: 'image' });
        else if (VID_EXT.test(u)) push(videos, u, { title, kind: 'video' });
        else if (AUD_EXT.test(u)) push(audio, u, { title, kind: 'audio' });
        else if (FILE_EXT.test(u)) push(files, u, { title, kind: 'file' });
        else if (/\b(download|attachment|file|export|getfile)\b/i.test(u) && !u.includes('#')) {
            push(files, u, { title: title || 'download', kind: 'file' });
        }
    }

    const ogVideo = /<meta\b[^>]+property\s*=\s*["']og:video(?::url)?["'][^>]+content\s*=\s*["']([^"']+)["']/gi;
    while ((m = ogVideo.exec(src))) push(videos, m[1], { kind: 'video', title: 'og:video' });
    const ogImage = /<meta\b[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/gi;
    while ((m = ogImage.exec(src))) push(images, m[1], { alt: 'og:image', kind: 'image' });

    return {
        links,
        images: images.slice(0, 40),
        videos: videos.slice(0, 20),
        audio: audio.slice(0, 20),
        files: files.slice(0, 30),
    };
}

export async function readPage(rawUrl, offset = 0, { links = false, images = false, media = false } = {}) {
    const res = await safeFetch(rawUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
    const isHtml = /html|xml/i.test(res.contentType) || /^\s*<(!doctype|html)/i.test(res.text);
    let title = '';
    let text = res.text;
    let assets = { links: [], images: [], videos: [], audio: [], files: [] };
    const wantAssets = links || images || media;
    if (isHtml) {
        ({ title, text } = htmlToText(res.text));
        if (wantAssets) assets = extractPageAssets(res.text, res.url);
    } else if (/json/i.test(res.contentType)) {
        try {
            text = JSON.stringify(JSON.parse(res.text), null, 1);
        } catch {}
    }
    const start = Math.max(0, Number(offset) || 0);
    const slice = text.slice(start, start + PAGE_CHARS);
    const rest = text.length - (start + slice.length);
    const showMedia = images || media;
    return {
        url: res.url,
        title,
        total: text.length,
        content: slice,
        next: rest > 0 ? start + slice.length : null,
        links: links ? assets.links : [],
        images: showMedia ? assets.images : [],
        videos: showMedia ? assets.videos : [],
        audio: showMedia ? assets.audio : [],
        files: showMedia ? assets.files : [],
    };
}

const unwrapDdg = (href) => {
    const h = decodeEntities(href);
    const m = /[?&]uddg=([^&]+)/.exec(h);
    if (m) {
        try {
            return decodeURIComponent(m[1]);
        } catch {}
    }
    return h.startsWith('//') ? `https:${h}` : h;
};

const stripTags = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseDdgHtml(html) {
    const out = [];
    const re = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippets = [...String(html).matchAll(/<(?:a|div|td)\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/gi)].map(m => stripTags(m[1]));
    let i = 0;
    for (const m of String(html).matchAll(re)) {
        const url = unwrapDdg(m[1]);
        if (!/^https?:\/\//i.test(url) || /duckduckgo\.com\/y\.js/.test(url)) {
            i++;
            continue;
        }
        out.push({ title: stripTags(m[2]), url, snippet: snippets[i] || '' });
        i++;
    }
    return out;
}

export function parseDdgLite(html) {
    const out = [];
    const links = [...String(html).matchAll(/<a\b([^>]*\bclass=['"][^'"]*result-link[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi)]
        .map(m => ({ href: /\bhref=['"]([^'"]+)['"]/i.exec(m[1])?.[1], title: m[2] }))
        .filter(l => l.href);
    const snippets = [...String(html).matchAll(/<td\b[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]));
    links.forEach((l, i) => {
        const url = unwrapDdg(l.href);
        if (/^https?:\/\//i.test(url)) out.push({ title: stripTags(l.title), url, snippet: snippets[i] || '' });
    });
    return out;
}

const unwrapBing = (href) => {
    const h = decodeEntities(href);
    const m = /[?&]u=a1([^&]+)/.exec(h);
    if (m) {
        try {
            const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(b64, 'base64').toString('utf8');
            if (/^https?:\/\//i.test(decoded)) return decoded;
        } catch {}
    }
    return h;
};

export function parseBing(html) {
    const out = [];
    for (const block of String(html).matchAll(/<li\b[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
        const a = /<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block[1]);
        if (!a) continue;
        const url = unwrapBing(a[1]);
        if (!/^https?:\/\//i.test(url)) continue;
        const sn = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block[1]);
        out.push({ title: stripTags(a[2]), url, snippet: sn ? stripTags(sn[1]) : '' });
    }
    return out;
}

const PROVIDERS = [
    {
        name: 'duckduckgo',
        run: async (q) => {
            const res = await safeFetch('https://html.duckduckgo.com/html/', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ q, kl: 'wt-wt' }).toString(),
            });
            return parseDdgHtml(res.text);
        },
    },
    {
        name: 'duckduckgo-lite',
        run: async (q) => {
            const res = await safeFetch('https://lite.duckduckgo.com/lite/', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ q }).toString(),
            });
            return parseDdgLite(res.text);
        },
    },
    {
        name: 'bing',
        run: async (q) => parseBing((await safeFetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=id`)).text),
    },
];

export async function webSearch(query, limit = 6) {
    const q = String(query || '').trim().slice(0, 300);
    if (!q) throw new Error('Query required. Example: web_search harga bitcoin hari ini');
    const errors = [];
    for (const p of PROVIDERS) {
        try {
            const results = (await p.run(q)).slice(0, limit);
            if (results.length) return { provider: p.name, results };
            errors.push(`${p.name}: no results`);
        } catch (e) {
            errors.push(`${p.name}: ${e.message}`);
        }
    }
    throw new Error(`Search failed (${errors.join(' | ')})`);
}
