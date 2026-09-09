import 'dotenv/config';
import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { logger } from './src/lib/logger.js';
import { initDb, flushDb, scheduleAutoReset } from './src/core/db.js';
import { loadPlugins, plugins } from './src/core/loader.js';
import { handler, participantsUpdate, getCaptchaPending } from './src/handler.js';
import { api } from './src/lib/api.js';
import { startDashboard } from './src/lib/dashboard.js';
import { startIpWatcher } from './src/lib/iplookup.js';
import { readGroupMetaCache, setGroupMetaCache } from './src/lib/groupCache.js';
import { cleanTempFiles } from './src/lib/utils.js';
import { config } from './src/config.js';
global.botName = config.bot.name;
global.owner   = config.owner.number;
global.ownerLid = config.owner.lid;
global.link    = config.bot.link;
global.thumb   = config.bot.thumb;
global.plugins = plugins;
global.api     = api;
global.botConnected = false;
setInterval(() => {}, 1 << 30);

const msgCache = new Map();
const cacheMsg = (m) => {
    if (msgCache.size >= 1000) msgCache.delete(msgCache.keys().next().value);
    msgCache.set(m.key.id, m);
};

process.on('SIGINT',  async () => { try { await flushDb(); } catch {} process.exit(0); });
process.on('SIGTERM', async () => { try { await flushDb(); } catch {} process.exit(0); });
process.on('uncaughtException',  (e) => logger.error(`[uncaughtException] ${e.message}`));
process.on('unhandledRejection', (r) => logger.error(`[unhandledRejection] ${r}`));

function handleCaptchaAnswer(sock, m, body) {
    const jid     = m.key.participant || m.key.remoteJid;
    const pending = getCaptchaPending().get(jid);
    if (!pending) return false;
    if (body.trim() === pending.answer) {
        clearTimeout(pending.timer);
        getCaptchaPending().delete(jid);
        sock.sendMessage(pending.groupId, { text: `✅ @${jid.split('@')[0]} berhasil!`, mentions: [jid] });
    } else {
        sock.sendMessage(pending.groupId, { text: `❌ @${jid.split('@')[0]} salah, coba lagi!`, mentions: [jid] });
    }
    return true;
}

let retryCount = 0;
const MAX_RETRY_BEFORE_REFRESH = 5;

async function start() {
    const phone = config.pairingNumber;

    const { state, saveCreds } = await useMultiFileAuthState('session');

    let version = [2, 3000, 1015901307];
    try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
    } catch {}

    logger.info(`WA v${version.join('.')} | Nomor: ${phone}`);

    const sock = makeWASocket({
        version,
        logger:              pino({ level: 'silent' }),
        printQRInTerminal:   false,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser:             Browsers.ubuntu('Chrome'),
        connectTimeoutMs:    60_000,
        keepAliveIntervalMs: 30_000,
        syncFullHistory:     false,
        markOnlineOnConnect: false,
        cachedGroupMetadata: async (jid) => readGroupMetaCache(jid),
        getMessage: async (key) => msgCache.get(key.id)?.message || { conversation: '' },
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phone);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                logger.success(`🔑 PAIRING CODE: ${formattedCode}`);
                logger.info('Buka WA → ⋮ → Perangkat Tertaut → Tautkan dengan nomor telepon → masukkan kode');
            } catch (e) {
                logger.error(`Pairing gagal: ${e.message}`);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            global.botConnected = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            logger.error(`Connection closed — code: ${code}`);

            if (code === DisconnectReason.loggedOut || code === 401) {
                logger.error('Session logout! Hapus folder session/ lalu restart.');
                return;
            }

            if (code === DisconnectReason.badSession) {
                logger.warn('Bad session terdeteksi, reconnect biasa tanpa hapus sesi...');
                setTimeout(start, 3000);
                return;
            }

            if (code === DisconnectReason.restartRequired) {
                logger.info('Restart diperlukan (normal setelah pairing), reconnecting...');
                setTimeout(start, 1000);
                return;
            }

            retryCount++;
            if (retryCount > MAX_RETRY_BEFORE_REFRESH) {
                logger.warn(`Gagal konek ${retryCount}x beruntun (code: ${code}), tetap reconnect biasa tanpa hapus sesi...`);
                setTimeout(start, 5000);
                return;
            }

            const delay = Math.min(retryCount * 3000, 15_000);
            logger.warn(`Reconnect ke-${retryCount} dalam ${delay / 1000}s...`);
            setTimeout(start, delay);

        } else if (connection === 'open') {
            retryCount = 0;
            global.botConnected = true;
            logger.success('✅ Bot connected!');
            await initDb();
            await loadPlugins();
            scheduleAutoReset();

            if (global.ownerLid) {
                logger.info(`Owner LID (manual dari .env): ${global.ownerLid}`);
            } else {
                try {
                    const ownerJid = global.owner.includes('@') ? global.owner : `${global.owner}@s.whatsapp.net`;
                    const resolvedLid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(ownerJid);
                    if (resolvedLid) {
                        global.ownerLid = resolvedLid.split(':')[0].replace(/@.+/, '') + '@lid';
                        logger.info(`Owner LID auto-resolved: ${global.ownerLid} (kalau ternyata salah, isi manual pakai OWNER_LID di .env)`);
                    } else {
                        logger.warn('Owner LID belum ke-mapping (WhatsApp belum kirim data mapping-nya). Bakal ke-resolve otomatis begitu owner chat bot — atau isi manual: kirim pesan ke bot, cek logs/bot.log baris [owner-check] → ambil digit dari "lid=", masukkan ke .env sebagai OWNER_LID.');
                    }
                } catch (e) {
                    logger.warn(`Gagal auto-resolve owner LID: ${e.message}`);
                }
            }

            logger.info(`${plugins.size} commands | Owner: ${global.owner || '(belum diset)'}`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages: msgs }) => {
        for (const m of msgs) {
            try {
                if (!m?.message || m.key.fromMe) continue;
                cacheMsg(m);

                const body = m.message.conversation
                    || m.message.extendedTextMessage?.text
                    || m.message.imageMessage?.caption
                    || m.message.videoMessage?.caption
                    || m.message.documentMessage?.caption
                    || m.message.documentWithCaptionMessage?.message?.documentMessage?.caption
                    || '';

                if (handleCaptchaAnswer(sock, m, body)) continue;

                await handler(sock, {
                    from:     m.key.remoteJid,
                    body,
                    sender:   { id: m.key.participant || m.key.remoteJid },
                    pushname: m.pushName || 'User',
                    isGroup:  m.key.remoteJid.endsWith('@g.us'),
                    raw:      m,
                });
            } catch (e) {
                logger.error(`[upsert] ${e.message}`);
            }
        }
    });

    sock.ev.on('group-participants.update', async (anu) => {
        try { await participantsUpdate(sock, anu); }
        catch (e) { logger.error(`[participants] ${e.message}`); }
    });

    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            if (!update.id) continue;
            try {
                const meta = await sock.groupMetadata(update.id);
                setGroupMetaCache(update.id, meta);
            } catch (e) {
                logger.debug(`[groups.update] gagal refresh cache ${update.id}: ${e.message}`);
            }
        }
    });
}

start();
startDashboard(config.dashboardPort);
startIpWatcher(config.dashboardPort);
setInterval(() => cleanTempFiles(), 15 * 60 * 1000)
