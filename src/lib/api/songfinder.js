import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import { uniqueId } from '../utils.js';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

const BASE_URL      = config.songFinder.baseUrl;
const AJAX_URL      = `${BASE_URL}/wp-admin/admin-ajax.php`;
const SESSION_TTL   = 15 * 60_000;
const RESULT_TTL    = 10 * 60_000;
const RESULT_LIMIT  = 50;
const TOOL_PAGE     = '/instagram/';
const FALLBACK_PAGE = '/';

const SONG_URL_PATTERN = /https?:\/\/(?:[\w-]+\.)*(?:tiktok\.com|instagram\.com|instagr\.am)\/[^\s<>"']+/i;
const PLATFORM_HOSTS   = [
    ['instagram', /(?:^|\.)(?:instagram\.com|instagr\.am)$/i],
    ['tiktok', /(?:^|\.)tiktok\.com$/i]
];

const BROWSER_HEADERS = {
    'accept-language':    'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua':          '"Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile':   '?1',
    'sec-ch-ua-platform': '"Android"',
    'user-agent':         'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
};

const NONCE_PATTERNS = [
    /["']nonce["']\s*:\s*["']([a-z0-9]{8,14})["']/i,
    /\bnonce\s*=\s*["']([a-z0-9]{8,14})["']/i,
    /name=["']nonce["'][^>]*value=["']([a-z0-9]{8,14})["']/i,
    /value=["']([a-z0-9]{8,14})["'][^>]*name=["']nonce["']/i,
    /data-nonce=["']([a-z0-9]{8,14})["']/i
];

const FIELD_KEYS = {
    title:  ['title', 'song', 'songtitle', 'track', 'trackname', 'trackTitle', 'name'],
    artist: ['artist', 'artists', 'artistname', 'subtitle', 'singer', 'author'],
    album:  ['album', 'albumname', 'albumtitle'],
    genre:  ['genre', 'genres'],
    year:   ['released', 'releasedate', 'year', 'releaseyear'],
    cover:  ['cover', 'coverart', 'artwork', 'artworkurl', 'image', 'thumbnail', 'thumb', 'picture', 'img']
};

const LINK_HOSTS = [
    ['Spotify', /spotify\.com/i],
    ['Apple Music', /music\.apple\.com|itunes\.apple\.com/i],
    ['YouTube Music', /music\.youtube\.com/i],
    ['YouTube', /youtube\.com|youtu\.be/i],
    ['Deezer', /deezer\.com/i],
    ['SoundCloud', /soundcloud\.com/i]
];

let session        = null;
let pendingSession = null;
const resultCache  = new Map();

const normalizeKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

const headerArgs = (extra = {}) => Object.entries({ ...BROWSER_HEADERS, ...extra }).flatMap(([key, value]) => ['-H', `${key}: ${value}`]);

async function curl(args) {
    const { stdout } = await execFileAsync('curl', ['-s', '--compressed', '--max-time', '45', ...args], { maxBuffer: 1024 * 1024 * 10 });
    return stdout;
}

function removeJar(jar) {
    try { fs.unlinkSync(jar); } catch {}
}

export function detectSongSource(url = '') {
    try {
        const { hostname } = new URL(url);
        return PLATFORM_HOSTS.find(([, pattern]) => pattern.test(hostname))?.[0] ?? null;
    } catch {
        return null;
    }
}

export function extractSongUrl(text = '') {
    const found = String(text).match(SONG_URL_PATTERN)?.[0];
    return found ? found.replace(/[)\].,!?]+$/, '') : null;
}

export function extractNonce(html = '') {
    for (const pattern of NONCE_PATTERNS) {
        const nonce = pattern.exec(html)?.[1];
        if (nonce) return nonce;
    }
    return null;
}

const isBlockedPage = (body) => !body.trim().startsWith('{') && /just a moment|cf-chl|attention required|enable javascript and cookies/i.test(body);

const isNonceRejected = (body) => {
    const text = body.trim();
    if (text === '0' || text === '-1') return true;
    return /"success"\s*:\s*false/.test(text) && /nonce|security|expired|forbidden|not allowed/i.test(text);
};

async function openSession() {
    const jar = path.join(os.tmpdir(), uniqueId('sfjar'));

    for (const page of [TOOL_PAGE, FALLBACK_PAGE]) {
        const html = await curl([
            ...headerArgs({
                'accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'sec-fetch-dest':            'document',
                'sec-fetch-mode':            'navigate',
                'sec-fetch-site':            'none',
                'upgrade-insecure-requests': '1'
            }),
            '-c', jar,
            '-b', jar,
            `${BASE_URL}${page}`
        ]);

        if (isBlockedPage(html)) {
            removeJar(jar);
            throw new Error('Diblokir proteksi anti-bot situs, coba lagi nanti.');
        }

        const nonce = extractNonce(html);
        if (nonce) {
            logger.debug(`[songfinder] session ready via ${page}`);
            return { jar, nonce, createdAt: Date.now() };
        }

        logger.warn(`[songfinder] nonce tidak ditemukan di ${page}`);
    }

    removeJar(jar);
    throw new Error('Gagal mengambil sesi dari situs (struktur halaman berubah atau tidak bisa diakses).');
}

async function getSession({ force = false } = {}) {
    if (!force && session && Date.now() - session.createdAt < SESSION_TTL) return session;

    if (!pendingSession) {
        pendingSession = openSession()
            .then(fresh => {
                if (session) removeJar(session.jar);
                session = fresh;
                return fresh;
            })
            .finally(() => { pendingSession = null; });
    }

    return pendingSession;
}

async function callAjax(current, url) {
    return curl([
        '-X', 'POST',
        ...headerArgs({
            'accept':             '*/*',
            'origin':             BASE_URL,
            'referer':            `${BASE_URL}${TOOL_PAGE}`,
            'sec-fetch-dest':     'empty',
            'sec-fetch-mode':     'cors',
            'sec-fetch-site':     'same-origin',
            'x-requested-with':   'XMLHttpRequest'
        }),
        '-b', current.jar,
        '-c', current.jar,
        '--form-string', 'action=sf_process',
        '--form-string', `nonce=${current.nonce}`,
        '--form-string', `url=${url}`,
        AJAX_URL
    ]);
}

function pickField(node, names) {
    for (const name of names.map(normalizeKey)) {
        const queue = [node];

        while (queue.length) {
            const current = queue.shift();
            if (!current || typeof current !== 'object') continue;

            for (const [key, value] of Object.entries(current)) {
                if (normalizeKey(key) !== name) continue;
                const text = valueToText(value);
                if (text) return text;
            }

            queue.push(...Object.values(current).filter(value => value && typeof value === 'object'));
        }
    }

    return '';
}

function valueToText(value) {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return valueToText(value.name ?? value.title ?? value.url ?? '');
    return '';
}

function linksFromText(text) {
    const links = {};
    for (const [url] of String(text).matchAll(/https?:\/\/[^\s"'<>\\]+/g)) {
        const label = LINK_HOSTS.find(([, pattern]) => pattern.test(url))?.[0];
        if (label && !links[label]) links[label] = url;
    }
    return links;
}

function linksFromPayload(payload) {
    const links = {};

    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        const { label, url } = node;
        if (typeof label === 'string' && typeof url === 'string' && /^https?:\/\//.test(url) && !links[label.trim()]) {
            links[label.trim()] = url;
        }
        Object.values(node).forEach(walk);
    };

    walk(payload);
    return Object.keys(links).length ? links : linksFromText(JSON.stringify(payload));
}

function parseObject(payload) {
    const title = pickField(payload, FIELD_KEYS.title);
    if (!title) return null;

    const cover = pickField(payload, FIELD_KEYS.cover);
    return {
        title,
        artist: pickField(payload, FIELD_KEYS.artist),
        album:  pickField(payload, FIELD_KEYS.album),
        genre:  pickField(payload, FIELD_KEYS.genre),
        year:   pickField(payload, FIELD_KEYS.year).slice(0, 4),
        cover:  /^https?:\/\//.test(cover) ? cover : '',
        links:  linksFromPayload(payload)
    };
}

async function parseHtml(html) {
    const { load } = await import('cheerio');
    const $        = load(html);
    const text     = (selector) => $(selector).first().text().trim();

    const title = text('[class*="title"]') || text('h1, h2, h3, h4') || text('strong');
    if (!title) return null;

    return {
        title,
        artist: text('[class*="artist"]') || text('[class*="subtitle"]') || text('[class*="singer"]'),
        album:  text('[class*="album"]'),
        genre:  text('[class*="genre"]'),
        year:   '',
        cover:  $('img').first().attr('src') || '',
        links:  linksFromText(html)
    };
}

async function parseResponse(body) {
    let json = null;
    try { json = JSON.parse(body); } catch {}

    if (!json) return body.includes('<') ? parseHtml(body) : null;
    if (json.success === false) {
        const reason = valueToText(json.data?.message ?? json.data ?? json.message);
        throw new Error(reason || 'Lagu tidak ditemukan.');
    }

    const payload = json.data ?? json;
    if (typeof payload === 'string') return payload.includes('<') ? parseHtml(payload) : null;
    return parseObject(payload);
}

function remember(url, result) {
    if (resultCache.size >= RESULT_LIMIT) resultCache.delete(resultCache.keys().next().value);
    resultCache.set(url, { result, expires: Date.now() + RESULT_TTL });
}

export async function findSongFromUrl(url) {
    if (!detectSongSource(url)) throw new Error('Link harus dari TikTok atau Instagram.');

    const cached = resultCache.get(url);
    if (cached && cached.expires > Date.now()) return cached.result;

    for (let attempt = 0; attempt < 2; attempt++) {
        const current = await getSession({ force: attempt > 0 });
        const body    = await callAjax(current, url);

        if (!body.trim()) throw new Error('Situs tidak memberi respons.');
        if (isBlockedPage(body)) throw new Error('Diblokir proteksi anti-bot situs, coba lagi nanti.');
        if (isNonceRejected(body)) {
            logger.warn('[songfinder] nonce ditolak, mengambil sesi baru...');
            continue;
        }

        const result = await parseResponse(body);
        if (!result) logger.warn(`[songfinder] respons tidak dikenali / tidak ada hasil: ${body.slice(0, 500)}`);
        else remember(url, result);
        return result;
    }

    throw new Error('Sesi ditolak server berulang kali.');
}
