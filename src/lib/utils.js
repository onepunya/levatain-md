import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { MAX_MEDIA_BYTES, MediaTooLargeError, assertBufferUnderLimit, sendRemoteMedia } from './mediaLimit.js';

export const toVoiceNoteOpus = buffer => new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const id = `vn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inputFile = path.join(tempDir, `${id}.mp3`);
    const outputFile = path.join(tempDir, `${id}.ogg`);

    const cleanup = () => {
        try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile); } catch {}
        try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch {}
    };

    fs.writeFileSync(inputFile, buffer);

    ffmpeg(inputFile)
        .audioCodec('libopus')
        .audioBitrate(64)
        .audioChannels(1)
        .format('ogg')
        .on('end', () => {
            try {
                const out = fs.readFileSync(outputFile);
                cleanup();
                resolve(out);
            } catch (error) {
                cleanup();
                reject(error);
            }
        })
        .on('error', error => {
            cleanup();
            reject(error);
        })
        .save(outputFile);
});

export function applyAudioFilter(buffer, filterChain) {
    return new Promise((resolve, reject) => {
        const input = new PassThrough();
        input.end(buffer);

        const chunks = [];
        const output = new PassThrough();
        output.on('data', chunk => chunks.push(chunk));
        output.on('end', () => resolve(Buffer.concat(chunks)));
        output.on('error', reject);

        ffmpeg(input)
            .audioFilters(filterChain)
            .audioCodec('libmp3lame')
            .audioBitrate(128)
            .format('mp3')
            .on('error', reject)
            .pipe(output, { end: true });
    });
}

export async function sendMess(sock, chatId, content, options = {}) {
    const { type = 'text', caption = '', buffer, title = global.botName, body = '' } = options;
    try {
        if (type === 'text') return await sock.sendMessage(chatId, { text: content });
        if (type === 'image') {
            let buf = buffer;
            if (typeof buffer === 'string' && buffer.startsWith('http')) {
                const res = await axios.get(buffer, { responseType: 'arraybuffer' });
                buf = Buffer.from(res.data, 'binary');
            }
            return await sock.sendMessage(chatId, {
                image: buf, caption,
                contextInfo: {
                    externalAdReply: {
                        title, body,
                        thumbnail: buf,
                        sourceUrl: global.link || '',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            });
        }
    } catch (e) {
        logger.error(`[sendMess] ${e.message}`);
    }
}

export const typing   = (sock, from) => sock.sendPresenceUpdate('composing', from);
export const getArgs  = (body, slice = 1) => body.split(' ').slice(slice).join(' ').trim();

const VIDEO_EXT = /\.(mp4|mov|mkv|webm|3gp|m4v)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|opus|aac)(\?|$)/i;

export function guessMediaType(url = '', hint = '') {
    const h = String(hint).toLowerCase();
    if (h.includes('video'))  return 'video';
    if (h.includes('image') || h.includes('photo') || h.includes('picture')) return 'image';
    if (h.includes('audio')) return 'audio';
    if (VIDEO_EXT.test(url)) return 'video';
    if (IMAGE_EXT.test(url)) return 'image';
    if (AUDIO_EXT.test(url)) return 'audio';
    return 'document';
}

async function detectRealMediaType(url) {
    const fromHeader = (ct) => {
        if (!ct) return null;
        if (ct.startsWith('image/')) return 'image';
        if (ct.startsWith('video/')) return 'video';
        if (ct.startsWith('audio/')) return 'audio';
        return null;
    };
    try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
        const type = fromHeader(res.headers.get('content-type'));
        if (type) return type;
    } catch {}
    try {

        const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-64' }, redirect: 'follow' });
        return fromHeader(res.headers.get('content-type'));
    } catch {}
    return null;
}

export async function sendAnyMedia(sock, jid, item, options = {}) {
    const { caption = '', quoted } = options;
    const url  = typeof item === 'string' ? item : (item.url || item.media);
    if (!url) throw new Error('sendAnyMedia: URL media kosong.');

    const hint = typeof item === 'string' ? '' : item.type;
    const type = (await detectRealMediaType(url)) || guessMediaType(url, hint);
    return sendRemoteMedia(sock, jid, { url, type, caption, quoted });
}

export async function sendMediaBatch(sock, jid, items, options = {}) {
    const list = Array.isArray(items) ? items : [items];
    const results = [];
    for (let i = 0; i < list.length; i++) {
        results.push(await sendAnyMedia(sock, jid, list[i], { ...options, caption: i === 0 ? (options.caption || '') : '' }));
    }
    return results;
}

export function getMediaMessage(raw, quoted, types = ['image', 'video', 'audio', 'sticker']) {
    const msg  = raw?.message;
    const qMsg = msg?.extendedTextMessage?.contextInfo?.quotedMessage || quoted?.raw?.message;
    for (const type of types) {
        const key   = `${type}Message`;
        const found = msg?.[key]
            || msg?.viewOnceMessage?.message?.[key]
            || msg?.viewOnceMessageV2?.message?.[key]
            || qMsg?.[key]
            || qMsg?.viewOnceMessage?.message?.[key]
            || qMsg?.viewOnceMessageV2?.message?.[key];
        if (found) return { media: found, type };
    }
    return null;
}

export async function downloadMedia(raw, quoted, types = ['image', 'video', 'audio', 'sticker']) {
    const result = getMediaMessage(raw, quoted, types);
    if (!result) return null;

    const declared = Number(result.media.fileLength || 0);
    if (declared > MAX_MEDIA_BYTES) {
        throw new MediaTooLargeError(declared, 'upload');
    }

    const stream = await downloadContentFromMessage(result.media, result.type);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > MAX_MEDIA_BYTES) throw new MediaTooLargeError(size, 'upload');
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    assertBufferUnderLimit(buffer, 'upload');
    return { buffer, type: result.type, mimetype: result.media.mimetype || null, size };
}

export const adReply = (title, body = '') => ({
    externalAdReply: {
        title, body,
        sourceUrl: global.link || '',
        thumbnailUrl: global.thumb,
        mediaType: 1
    }
});

export const getExtFromMime = (mime) => {
    const map = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp',
                  mp4: 'mp4', webm: 'webm', mpeg: 'mp3', mp3: 'mp3', ogg: 'ogg',
                  pdf: 'pdf', zip: 'zip' };
    const raw = mime.split('/')[1]?.split(';')[0] || 'bin';
    return map[raw] || raw;
};
const _getExt = getExtFromMime;

const _withTimeout = (promise, ms) =>
    Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error(`timeout ${ms}ms`)), ms))]);

const _catbox = async (buffer, mime) => {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', new Blob([buffer], { type: mime }), `upload.${_getExt(mime)}`);
    const res = await _withTimeout(fetch('https://catbox.moe/user.php', { method: 'POST', body: form }), 20000);
    const txt = await res.text();
    if (!txt.startsWith('https://')) throw new Error(txt.slice(0, 80));
    return txt.trim();
};

const _litterbox = async (buffer, mime) => {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '72h');
    form.append('fileToUpload', new Blob([buffer], { type: mime }), `upload.${_getExt(mime)}`);
    const res = await _withTimeout(fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: form }), 20000);
    const txt = await res.text();
    if (!txt.startsWith('https://')) throw new Error(txt.slice(0, 80));
    return txt.trim();
};

const _tmpfiles = async (buffer, mime) => {
    const ext  = _getExt(mime);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `${Date.now()}.${ext}`);
    const res  = await _withTimeout(fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form }), 20000);
    const json = await res.json();
    if (!json?.data?.url) throw new Error('tmpfiles: no url');
    return json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
};

const _0x0st = async (buffer, mime) => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `upload.${_getExt(mime)}`);
    const res = await _withTimeout(fetch('https://0x0.st', {
        method: 'POST',
        body: form,
        headers: { 'User-Agent': 'curl/8.0' }
    }), 20000);
    const txt = (await res.text()).trim();
    if (!txt.startsWith('https://') && !txt.startsWith('http://')) throw new Error(txt.slice(0, 80));
    return txt;
};

export const uploadToUrl = async (buffer, mimetype = 'image/jpeg') => {
    const services = [
        { name: 'catbox',    fn: () => _catbox(buffer, mimetype)    },
        { name: '0x0.st',    fn: () => _0x0st(buffer, mimetype)     },
        { name: 'litterbox', fn: () => _litterbox(buffer, mimetype) },
        { name: 'tmpfiles',  fn: () => _tmpfiles(buffer, mimetype)  },
    ];
    const errors = [];
    for (const svc of services) {
        try {
            const url = await svc.fn();
            if (svc.name !== 'catbox') logger.warn(`[upload] fallback → ${svc.name}`);
            return url;
        } catch (e) {
            logger.warn(`[upload] ${svc.name} failed: ${e.message}`);
            errors.push(`${svc.name}: ${e.message}`);
        }
    }
    throw new Error(`Semua layanan upload gagal:${errors.join('')}`);
};

export const hasRestrictedLinks = body => {
    try {
        const regex = /\bhttps?:\/\/(?:chat\.whatsapp\.com\/[a-zA-Z0-9]+|wa\.me\/[0-9]+|whatsapp\.com\/channel\/[a-zA-Z0-9]+)/gi;
        return (body?.match(regex)?.length || 0) > 0;
    } catch {
        return false;
    }
};

export const socmed = url => {
    const patterns = {
        tiktok:    /^(?:https?:\/\/)?(?:www\.|vt\.|vm\.|t\.)?(?:tiktok\.com\/)(?:\S+)?$/,
        instagram: /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)(?:tv\/|p\/|reel\/|stories\/|s\/)(?:\S+)?$/,
        facebook:  /^(?:https?:\/\/)?(?:web\.|www\.|m\.)?(?:facebook|fb)\.(?:com|watch)\/\S+$/,
        twitter:   /https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/,
        youtube:   /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtu\.?be(?:\.com)?\/.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)&?/,
        pinterest: /pin(?:terest)?(?:\.it|\.com)/,
        mediafire: /^(?:https?:\/\/)?(?:www\.)?(?:mediafire\.com\/)(?:\S+)?$/,
    };
    for (const [platform, regex] of Object.entries(patterns)) {
        if (regex.test(url)) return platform;
    }
    return null;
};

export const ttFixed = url => {
    if (!/tiktok\.com\/t\//.test(url)) return url;
    const id = url.split('/t/')[1];
    return 'https://vm.tiktok.com/' + id;
};

export const igFixed = url => {
    const parts = url.split('/');
    if (parts.length !== 7) return url;
    return parts.filter((_, i) => i !== 3).join('/');
};

export const isBot = id => {
    return !!id && ((id.startsWith('3EB0') && id.length === 40) || id.startsWith('BAE') || /-/.test(id));
};

export function cleanTempFiles(maxAgeMs = 10 * 60 * 1000) {
    try {
        const dir = os.tmpdir();
        const now = Date.now();
        for (const file of fs.readdirSync(dir)) {
            if (!/^(vn|fx)-\d+-/.test(file)) continue;
            const full = path.join(dir, file);
            try {
                const stat = fs.statSync(full);
                if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
            } catch {}
        }
    } catch (e) {
        logger.warn(`[cleanTempFiles] ${e.message}`);
    }
}
