const UPLOAD_URL = 'https://push.clients6.google.com/upload/';
const PUSH_ID = process.env.GEMINI_PUSH_ID || 'feeds/mcudyrk2a4khkz';
const TENANT_ID = 'bard-storage';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const FORM_TYPE = 'application/x-www-form-urlencoded;charset=utf-8';

const baseHeaders = (cookie) => ({
    cookie,
    origin: 'https://gemini.google.com',
    referer: 'https://gemini.google.com/',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'push-id': PUSH_ID,
    'x-tenant-id': TENANT_ID,
    'user-agent': USER_AGENT,
});

const snippet = (value) => String(value || '').replace(/\s+/g, ' ').slice(0, 160);

const safeFileName = (name) => String(name || 'image.jpg').replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'image.jpg';

export async function uploadGeminiImage(buffer, filename, cookie) {
    if (!cookie) throw new Error('GEMINI_COOKIE is empty in .env');
    const name = safeFileName(filename);

    const start = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: {
            ...baseHeaders(cookie),
            'content-type': FORM_TYPE,
            'x-goog-upload-command': 'start',
            'x-goog-upload-protocol': 'resumable',
            'x-goog-upload-header-content-length': String(buffer.length),
        },
        body: `File name: ${name}`,
        signal: AbortSignal.timeout(30_000),
    });
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!start.ok || !uploadUrl) {
        const detail = snippet(await start.text().catch(() => ''));
        throw new Error(`Upload start gagal (${start.status})${detail ? `: ${detail}` : ''}`);
    }

    const done = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            ...baseHeaders(cookie),
            'content-type': FORM_TYPE,
            'x-goog-upload-command': 'upload, finalize',
            'x-goog-upload-offset': '0',
        },
        body: buffer,
        signal: AbortSignal.timeout(60_000),
    });
    const text = (await done.text().catch(() => '')).trim();
    if (!done.ok || !text.startsWith('/contrib_service/')) {
        throw new Error(`Upload gagal (${done.status}): ${snippet(text)}`);
    }
    return text;
}

export { safeFileName };
