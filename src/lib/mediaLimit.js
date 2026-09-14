import axios from 'axios';
import { logger } from './logger.js';

export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
export const MAX_MEDIA_MB = 15;

export class MediaTooLargeError extends Error {
    constructor(sizeBytes = 0, kind = 'download') {
        const mb = sizeBytes ? `${formatMb(sizeBytes)}MB` : `lebih dari ${MAX_MEDIA_MB}MB`;
        super(`File terlalu besar (${mb}). Batas ${kind} media ${MAX_MEDIA_MB}MB.`);
        this.name = 'MediaTooLargeError';
        this.sizeBytes = sizeBytes;
        this.kind = kind;
    }
}

export function formatMb(bytes = 0) {
    return (Number(bytes) / 1024 / 1024).toFixed(1);
}

export function assertBufferUnderLimit(buf, kind = 'upload') {
    const size = buf?.length || buf?.byteLength || 0;
    if (size > MAX_MEDIA_BYTES) throw new MediaTooLargeError(size, kind);
    return size;
}

export async function headContentLength(url, headers = {}) {
    if (!url) return 0;
    try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers });
        const len = parseInt(res.headers.get('content-length') || '0', 10);
        return Number.isFinite(len) ? len : 0;
    } catch {
        return 0;
    }
}

export async function ensureUrlUnderLimit(url, headers = {}) {
    if (!url) return 0;
    let len = await headContentLength(url, headers);
    if (!len) {
        try {
            const res = await axios.head(url, { headers, timeout: 15000, maxRedirects: 5, validateStatus: s => s >= 200 && s < 400 });
            len = parseInt(res.headers['content-length'] || '0', 10) || 0;
        } catch {}
    }
    if (len > MAX_MEDIA_BYTES) throw new MediaTooLargeError(len, 'download');
    return len;
}

export async function fetchBufferLimited(url, { headers = {}, timeout = 60000, referer } = {}) {
    const hdrs = { ...headers };
    if (referer) hdrs.Referer = referer;
    await ensureUrlUnderLimit(url, hdrs);
    const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: hdrs,
        timeout,
        maxContentLength: MAX_MEDIA_BYTES,
        maxBodyLength: MAX_MEDIA_BYTES,
        validateStatus: s => s >= 200 && s < 300,
    });
    const buf = Buffer.from(data);
    assertBufferUnderLimit(buf, 'download');
    return buf;
}

export async function sendRemoteMedia(sock, jid, { url, type = 'video', caption = '', quoted, mimetype, fileName } = {}) {
    if (!url) throw new Error('URL media kosong.');
    try {
        await ensureUrlUnderLimit(url);
    } catch (e) {
        if (e instanceof MediaTooLargeError) throw e;
        logger.warn(`[mediaLimit] cek ukuran gagal, lanjut kirim: ${e.message}`);
    }

    const payload =
        type === 'video' ? { video: { url }, caption } :
        type === 'image' ? { image: { url }, caption } :
        type === 'audio' ? { audio: { url }, mimetype: mimetype || 'audio/mpeg', fileName } :
        { document: { url }, caption, fileName: fileName || url.split('/').pop()?.split('?')[0] || 'file' };

    return sock.sendMessage(jid, payload, quoted ? { quoted } : {});
}
