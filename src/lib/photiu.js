import { logger } from './logger.js';

const PHOTIU_BASE = 'https://www.photiu.ai';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const _extFromMime = (mime = 'image/jpeg') => (mime.split('/')[1] || 'jpg').split(';')[0];

async function getPhotiuCookies() {
    const res = await fetch(`${PHOTIU_BASE}/id/image-upscaler`, {
        headers: { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
    });

    const rawCookies = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [...res.headers].filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v);

    const jar = {};
    for (const c of rawCookies) {
        const pair = c.split(';')[0];
        const idx  = pair.indexOf('=');
        if (idx === -1) continue;
        jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
    return jar;
}

export async function upscaleImage(buffer, mime = 'image/jpeg') {
    let cookieHeader = '';
    try {
        const jar = await getPhotiuCookies();
        cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    } catch (e) {
        logger.warn(`[photiu] gagal ambil cookie sesi: ${e.message}, lanjut tanpa cookie...`);
    }

    const form = new FormData();
    form.append('upfile', new Blob([buffer], { type: mime }), `upload.${_extFromMime(mime)}`);

    const res = await fetch(`${PHOTIU_BASE}/api/tools/img_improve`, {
        method: 'POST',
        headers: {
            accept: '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            origin: PHOTIU_BASE,
            referer: `${PHOTIU_BASE}/id/image-upscaler`,
            'user-agent': UA,
            'x-paramsjs': JSON.stringify({ mode: 'upscale', level: 'default' }),
            'x-priceparams': JSON.stringify({ mode: 'upscale', level: 'default' }),
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
        body: form,
    });

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

        const url = data?.url || data?.data?.url || data?.result?.url
            || data?.output_url || data?.data?.output_url || data?.image;
        if (url) return url;

        const b64 = data?.data?.base64 || data?.base64;
        if (b64) return Buffer.from(b64.replace(/^data:.*;base64,/, ''), 'base64');

        throw new Error(`Respons tidak dikenali dari photiu.ai: ${JSON.stringify(data).slice(0, 150)}`);
    }

    if (contentType.startsWith('image/')) {
        return Buffer.from(await res.arrayBuffer());
    }

    const text = await res.text();
    throw new Error(`Upscale gagal (${res.status}): ${text.slice(0, 150) || 'respons tidak dikenal, endpoint kemungkinan berubah'}`);
}
