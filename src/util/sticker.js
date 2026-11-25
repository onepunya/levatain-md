import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';

const SIZE = 512;
const MAX_ANIMATED_BYTES = 900 * 1024;
const MAX_STATIC_BYTES = 90 * 1024;
const MAX_SECONDS = 8;

const ANIM_ATTEMPTS = [
    { fps: 15, q: 55, secs: MAX_SECONDS },
    { fps: 15, q: 40, secs: MAX_SECONDS },
    { fps: 12, q: 35, secs: MAX_SECONDS },
    { fps: 12, q: 25, secs: 6 },
    { fps: 10, q: 20, secs: 5 },
    { fps: 8, q: 15, secs: 4 },
];

const tmp = ext => path.join(os.tmpdir(), `stk-${crypto.randomBytes(6).toString('hex')}.${ext}`);
const rm = (...files) => files.forEach(f => { try { fs.unlinkSync(f); } catch {} });

function run(bin, args) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, { maxBuffer: 1024 * 1024 * 16, timeout: 120000 }, (err, _out, stderr) => {
            if (err) reject(new Error(String(stderr || err.message).split('\n').slice(-4).join(' ').trim()));
            else resolve();
        });
    });
}

function videoFilter(mode, fps) {
    let scale;
    if (mode === 'fit') {
        scale = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,` +
            `pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
    } else if (mode === 'crop') {
        scale = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SIZE}:${SIZE},format=rgba`;
    } else {
        scale = `scale='min(${SIZE},iw)':'min(${SIZE},ih)':force_original_aspect_ratio=decrease:flags=lanczos,` +
            `scale=trunc(iw/2)*2:trunc(ih/2)*2,format=rgba`;
    }
    return `fps=${fps},${scale},setsar=1`;
}

async function animatedWebp(input, mode) {
    const inFile = tmp('bin');
    fs.writeFileSync(inFile, input);
    let best = null;
    try {
        for (const a of ANIM_ATTEMPTS) {
            const out = tmp('webp');
            try {
                await run('ffmpeg', [
                    '-y', '-v', 'error', '-i', inFile,
                    '-t', String(a.secs), '-an',
                    '-vf', videoFilter(mode, a.fps),
                    '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(a.q),
                    '-compression_level', '6', '-loop', '0', '-vsync', '0',
                    out,
                ]);
                const buf = fs.readFileSync(out);
                if (!best || buf.length < best.length) best = buf;
                if (buf.length <= MAX_ANIMATED_BYTES) return buf;
            } finally {
                rm(out);
            }
        }
    } finally {
        rm(inFile);
    }
    throw new Error(`video terlalu berat untuk jadi stiker (hasil ${Math.round((best?.length || 0) / 1024)}KB). Coba video yang lebih pendek.`);
}

async function staticWebp(input, mode) {
    const { default: sharp } = await import('sharp');
    const opts = mode === 'fit' ? { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        : mode === 'crop' ? { fit: 'cover' }
        : { fit: 'inside', withoutEnlargement: true };
    for (const quality of [80, 65, 50, 35]) {
        const buf = await sharp(input, { animated: false })
            .resize(SIZE, SIZE, opts)
            .webp({ quality })
            .toBuffer();
        if (buf.length <= MAX_STATIC_BYTES) return buf;
        if (quality === 35) return buf;
    }
}

function injectExif(webp, pack, author) {
    const json = Buffer.from(JSON.stringify({
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': String(pack || ''),
        'sticker-pack-publisher': String(author || ''),
        emojis: [''],
    }), 'utf8');
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    head.writeUInt32LE(json.length, 14);
    const exif = Buffer.concat([head, json]);

    if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') return webp;

    const chunks = [];
    let hasVp8x = false;
    let pos = 12;
    while (pos + 8 <= webp.length) {
        const id = webp.toString('ascii', pos, pos + 4);
        const size = webp.readUInt32LE(pos + 4);
        const end = pos + 8 + size + (size % 2);
        let data = webp.subarray(pos + 8, pos + 8 + size);
        if (id === 'EXIF') { pos = end; continue; }
        if (id === 'VP8X') {
            hasVp8x = true;
            data = Buffer.from(data);
            data[0] |= 0x08;
        }
        chunks.push({ id, data });
        pos = end;
    }
    if (!hasVp8x) return webp;
    chunks.push({ id: 'EXIF', data: exif });

    const parts = [Buffer.from('WEBP')];
    for (const { id, data } of chunks) {
        const h = Buffer.alloc(8);
        h.write(id, 0, 'ascii');
        h.writeUInt32LE(data.length, 4);
        parts.push(h, data);
        if (data.length % 2) parts.push(Buffer.alloc(1));
    }
    const body = Buffer.concat(parts);
    const riff = Buffer.alloc(8);
    riff.write('RIFF', 0, 'ascii');
    riff.writeUInt32LE(body.length, 4);
    return Buffer.concat([riff, body]);
}

export async function makeSticker(buffer, { type = 'image', mimetype = '', pack = '', author = '', mode = 'orig' } = {}) {
    const isWebp = buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (isWebp && buffer.includes(Buffer.from('ANIM'))) return injectExif(buffer, pack, author);
    const animated = type === 'video' || /gif|webm|mp4/i.test(mimetype);
    const webp = animated ? await animatedWebp(buffer, mode) : await staticWebp(buffer, mode);
    return injectExif(webp, pack, author);
}

export function parseStickerMode(text) {
    const t = String(text || '');
    if (/(^|\s)-?crop\b/i.test(t)) return 'crop';
    if (/(^|\s)-?(fit|contain|pas)\b/i.test(t)) return 'fit';
    return 'orig';
}
