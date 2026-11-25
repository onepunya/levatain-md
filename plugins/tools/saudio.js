import { randomBytes } from 'node:crypto';
import { proto, prepareWAMessageMedia } from '@whiskeysockets/baileys';
import { downloadMedia, runFfmpegTempFile } from '../../src/util/index.js';
import { plugin } from '../../src/core/plugin.js';

const SESSION_TTL = 5 * 60 * 1000;
const SESSION_CAP = 10;

// Disimpan di globalThis supaya tidak hilang saat plugin di-reload (cache bust)
const SESSIONS = (globalThis.__LEV_SAUDIO_SESSIONS ??= new Map());
const PENDING = (globalThis.__LEV_SAUDIO_PENDING ??= new Map());
const PATCH_MARK = Symbol.for('levatain.saudio.encodePatch');

const HELP =
    '🔊 *STICKER AUDIO*\n\n' +
    '*Sekali tembak:*\n' +
    '• Reply audio/VN, lalu kirim gambar dengan caption `.saudio`\n' +
    '• Reply gambar/stiker, lalu kirim `.saudio` (reply ke audio)\n\n' +
    '*2 langkah:*\n' +
    '1) Reply gambar/stiker + `.saudio`\n' +
    '2) Reply audio/VN + `.saudio`\n\n' +
    '`.saudio reset` → buang sesi tersimpan';

const RESET_RE = /^(reset|del|hapus|cancel|batal)$/;

/* ───────────── session ───────────── */

function getSession(id) {
    const s = SESSIONS.get(id);
    if (!s) return null;
    if (Date.now() - s.ts > SESSION_TTL) {
        SESSIONS.delete(id);
        return null;
    }
    return s;
}

function setSession(id, data) {
    if (!SESSIONS.has(id) && SESSIONS.size >= SESSION_CAP) {
        SESSIONS.delete(SESSIONS.keys().next().value);
    }
    data.ts = Date.now();
    SESSIONS.set(id, data);
}

/* ───────────── protobuf manual ───────────── */

function varint(n) {
    let v = BigInt(n);
    const out = [];
    while (v > 127n) {
        out.push(Number((v & 127n) | 128n));
        v >>= 7n;
    }
    out.push(Number(v));
    return Buffer.from(out);
}

function ld(field, body) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return Buffer.concat([varint((field << 3) | 2), varint(buf.length), buf]);
}

function toBuf(val) {
    if (!val) return Buffer.alloc(0);
    if (Buffer.isBuffer(val)) return val;
    if (val instanceof Uint8Array) return Buffer.from(val);
    return Buffer.from(String(val), 'base64');
}

function mediaDomainInfo(keyBuf) {
    return ld(74, Buffer.concat([Buffer.from([0x08, 0x01]), ld(2, keyBuf)]));
}

/* ───────────── konversi media ───────────── */

async function toOpus(input) {
    if (input.subarray(0, 4).toString('ascii') === 'OggS') {
        return { buf: input, mimetype: 'audio/ogg; codecs=opus' };
    }
    const buf = await runFfmpegTempFile(input, {
        inExt: 'bin',
        outExt: 'ogg',
        idPrefix: 'saudio',
        configure: command => command
            .noVideo()
            .audioCodec('libopus')
            .audioBitrate(64)
            .audioChannels(1)
            .audioFrequency(48000)
            .outputOptions(['-map_metadata', '-1'])
            .format('ogg'),
    });
    return { buf, mimetype: 'audio/ogg; codecs=opus' };
}

const isWebp = b =>
    b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

async function toWebp(input) {
    if (isWebp(input)) return input;
    const { default: sharp } = await import('sharp');
    return sharp(input)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();
}

function parseWebp(b) {
    if (!isWebp(b)) throw new Error('WebP tidak valid');
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
        return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, isAnimated: false };
    }
    if (chunk === 'VP8L') {
        return {
            width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
            height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)),
            isAnimated: false,
        };
    }
    if (chunk === 'VP8X') {
        return {
            width: 1 + b.readUIntLE(24, 3),
            height: 1 + b.readUIntLE(27, 3),
            isAnimated: (b[20] & 2) !== 0,
        };
    }
    throw new Error('Chunk WebP tidak didukung');
}

/* ───────────── patch encode (sekali pasang, dipakai bersama) ───────────── */

function installEncodePatch() {
    const Msg = proto.Message;
    if (Msg.encode?.[PATCH_MARK]) return;

    const original = Msg.encode;
    const patched = function (msg, w) {
        const secret = msg?.messageContextInfo?.messageSecret;
        const body = secret ? PENDING.get(Buffer.from(secret).toString('hex')) : null;
        if (!body) return original.call(this, msg, w);

        const out = original.call(this, { messageContextInfo: msg.messageContextInfo }, w);
        if (out && typeof out.uint32 === 'function') {
            out.uint32((134 << 3) | 2).bytes(body);
            return out;
        }
        if (out instanceof Uint8Array) {
            return Buffer.concat([Buffer.from(out), ld(134, body)]);
        }
        return out;
    };
    patched[PATCH_MARK] = true;
    Msg.encode = patched;
}

/* ───────────── kirim sticker audio ───────────── */

async function sendAudioSticker(sock, jid, audioBuf, visualBuf) {
    const [opus, stickerBuf] = await Promise.all([toOpus(audioBuf), toWebp(visualBuf)]);
    const webp = parseWebp(stickerBuf);
    const upload = sock.waUploadToServer;

    const [aPrep, sPrep] = await Promise.all([
        prepareWAMessageMedia({ audio: opus.buf, mimetype: opus.mimetype }, { upload }),
        prepareWAMessageMedia({ sticker: stickerBuf, mimetype: 'image/webp' }, { upload }),
    ]);
    const a = aPrep.audioMessage;
    const s = sPrep.stickerMessage;
    const now = Math.floor(Date.now() / 1000);

    const aKey = toBuf(a.mediaKey);
    const sKey = toBuf(s.mediaKey);

    const audioBytes = Buffer.concat([
        Buffer.from(proto.Message.AudioMessage.encode({
            url: a.url,
            mimetype: opus.mimetype,
            fileSha256: toBuf(a.fileSha256),
            fileEncSha256: toBuf(a.fileEncSha256),
            fileLength: a.fileLength ?? opus.buf.length,
            mediaKey: aKey,
            directPath: a.directPath,
            mediaKeyTimestamp: a.mediaKeyTimestamp || now,
        }).finish()),
        ld(17, mediaDomainInfo(aKey)),
    ]);

    const stickerBase = Buffer.concat([
        Buffer.from(proto.Message.StickerMessage.encode({
            url: s.url,
            fileSha256: toBuf(s.fileSha256),
            fileEncSha256: toBuf(s.fileEncSha256),
            mediaKey: sKey,
            mimetype: 'image/webp',
            height: webp.height,
            width: webp.width,
            directPath: s.directPath,
            fileLength: s.fileLength ?? stickerBuf.length,
            mediaKeyTimestamp: s.mediaKeyTimestamp || now,
            isAnimated: webp.isAnimated,
            stickerSentTs: Date.now(),
        }).finish()),
        ld(17, Buffer.concat([mediaDomainInfo(sKey), ld(82, varint(13001))])),
    ]);

    const futureProofBody = ld(1, ld(26, Buffer.concat([stickerBase, ld(26, audioBytes)])));

    const secret = randomBytes(32);
    const secretHex = secret.toString('hex');
    const payload = {
        extendedTextMessage: { text: ' ' },
        messageContextInfo: { messageSecret: secret },
    };

    installEncodePatch();
    PENDING.set(secretHex, futureProofBody);
    try {
        await sock.relayMessage(jid, payload, { additionalAttributes: { type: 'text' } });
    } finally {
        PENDING.delete(secretHex);
    }
}

/* ───────────── ambil media ───────────── */

async function grab(raw, quoted, types) {
    try {
        return await downloadMedia(raw, quoted, types);
    } catch {
        return null;
    }
}

export default plugin('saudio', 'stickeraudio', 'sa')
    .in('tools')
    .desc('Gabungin gambar/stiker + audio jadi Sticker Audio')
    .prefixOnly()
    .cooldown(5)
    .signal('User asks to combine an image or sticker with an audio into an audio sticker', [
        'saudio',
        'bikin sticker audio',
    ])
    .run(async (sock, { body, message, raw, from, primaryId, reply, react }) => {
        const arg = String(body || '').trim().split(/\s+/).slice(1).join(' ').toLowerCase();
        if (RESET_RE.test(arg)) {
            SESSIONS.delete(primaryId);
            return reply('🗑️ Sesi Sticker Audio dibuang.');
        }

        const [audio, visual] = await Promise.all([
            grab(raw, message.quoted, ['audio']),
            grab(raw, message.quoted, ['image', 'sticker']),
        ]);

        const saved = getSession(primaryId) || { audioBuf: null, visualBuf: null };
        if (audio) saved.audioBuf = audio.buffer;
        if (visual) saved.visualBuf = visual.buffer;

        if (saved.audioBuf && saved.visualBuf) {
            SESSIONS.delete(primaryId);
            await react('⏳').catch(() => {});
            try {
                await sendAudioSticker(sock, from, saved.audioBuf, saved.visualBuf);
                await react('✅').catch(() => {});
            } catch (e) {
                await react('❎').catch(() => {});
                return reply('❌ Gagal bikin Sticker Audio:\n' + String(e.message || e).slice(0, 300));
            }
            return;
        }

        if (saved.audioBuf || saved.visualBuf) {
            setSession(primaryId, saved);
            return reply(saved.audioBuf
                ? '✅ Audio tersimpan. Sekarang reply/kirim *gambar atau stiker* dengan `.saudio`.\n⏳ Sesi berlaku 5 menit.'
                : '✅ Gambar/stiker tersimpan. Sekarang reply *audio/VN* dengan `.saudio`.\n⏳ Sesi berlaku 5 menit.');
        }

        return reply(HELP);
    });
