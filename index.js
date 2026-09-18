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
import {
    logger,
    startDashboard,
    extractBody,
    detectDevice,
    startIpWatcher,
    readGroupMetaCache,
    setGroupMetaCache,
    cleanTempFiles
} from './src/lib/index.js';
import { initDb, flushDb, scheduleAutoReset } from './src/core/db.js';
import { loadPlugins, plugins } from './src/core/loader.js';
import { handler, participantsUpdate, getCaptchaPending } from './src/handler.js';
import { config } from './src/config.js';
import { initGlobals } from './src/globals.js';

initGlobals();
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
        sock.sendMessage(pending.groupId, { text: `✅ @${jid.split('@')[0]} passed!`, mentions: [jid] });
    } else {
        sock.sendMessage(pending.groupId, { text: `❌ @${jid.split('@')[0]} wrong, try again!`, mentions: [jid] });
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

    global.sock = sock;

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phone);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                logger.success(`🔑 PAIRING CODE: ${formattedCode}`);
                logger.info('Open WA → ⋮ → Linked Devices → Link with phone number → enter the code');
            } catch (e) {
                logger.error(`Pairing failed: ${e.message}`);
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
                logger.warn(`Failed to connect ${retryCount}x in a row (code: ${code}), continuing with plain reconnect without deleting the session...`);
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
                logger.info(`Owner LID (manually set via .env): ${global.ownerLid}`);
            } else {
                try {
                    const ownerJid = global.owner.includes('@') ? global.owner : `${global.owner}@s.whatsapp.net`;
                    const resolvedLid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(ownerJid);
                    if (resolvedLid) {
                        global.ownerLid = resolvedLid.split(':')[0].replace(/@.+/, '') + '@lid';
                        logger.info(`Owner LID auto-resolved: ${global.ownerLid} (if this turns out to be wrong, set it manually with OWNER_LID in .env)`);
                    } else {
                        logger.warn('Owner LID not mapped yet (WhatsApp hasn\'t sent the mapping data). It will auto-resolve as soon as the owner messages the bot — or set it manually: message the bot, check logs/bot.log for the [owner-check] line → grab the digits from "lid=", put it in .env as OWNER_LID.');
                    }
                } catch (e) {
                    logger.warn(`Failed to auto-resolve owner LID: ${e.message}`);
                }
            }

            logger.info(`${plugins.size} commands | Owner: ${global.owner || '(not set)'}`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages: msgs }) => {
        for (const m of msgs) {
            try {
                if (!m?.message || m.key.fromMe) continue;
                cacheMsg(m);

                const body = extractBody(m);

                if (handleCaptchaAnswer(sock, m, body)) continue;

                await handler(sock, {
                    from:     m.key.remoteJid,
                    body,
                    sender:   { id: m.key.participant || m.key.remoteJid },
                    pushname: m.pushName || 'User',
                    isGroup:  m.key.remoteJid.endsWith('@g.us'),
                    raw:      m,
                    device:   detectDevice(m),
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
                logger.debug(`[groups.update] failed to refresh cache ${update.id}: ${e.message}`);
            }
        }
    });
}

start();
startDashboard(config.dashboardPort);
startIpWatcher(config.dashboardPort);
setInterval(() => cleanTempFiles(), 15 * 60 * 1000)
