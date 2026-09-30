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
    cleanTempFiles,
    cacheMessage,
    getCachedMessage
} from './src/lib/index.js';
import { initDb, flushDb, scheduleAutoReset } from './src/core/db.js';
import { loadPlugins, plugins } from './src/core/loader.js';
import { handler, participantsUpdate } from './src/handler.js';
import { handleCaptchaAnswer } from './src/core/groupEvents.js';
import { config } from './src/config.js';
import { initGlobals } from './src/globals.js';

const FALLBACK_WA_VERSION = [2, 3000, 1015901307];
const MAX_FAST_RETRIES    = 5;
const TEMP_CLEAN_INTERVAL = 15 * 60_000;
const silentLogger        = pino({ level: 'silent' });

let retryCount = 0;

initGlobals();
setInterval(() => {}, 1 << 30);

async function shutdown() {
    try { await flushDb(); } catch {}
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException',  (e) => logger.error(`[uncaughtException] ${e.message}`));
process.on('unhandledRejection', (r) => logger.error(`[unhandledRejection] ${r}`));

async function resolveWaVersion() {
    try {
        return (await fetchLatestBaileysVersion()).version;
    } catch {
        return FALLBACK_WA_VERSION;
    }
}

function requestPairing(sock, phone) {
    if (sock.authState.creds.registered) return;
    setTimeout(async () => {
        try {
            const code = await sock.requestPairingCode(phone);
            logger.success(`🔑 PAIRING CODE: ${code?.match(/.{1,4}/g)?.join('-') || code}`);
            logger.info('Open WA → ⋮ → Linked Devices → Link with phone number → enter the code');
        } catch (e) {
            logger.error(`Pairing failed: ${e.message}`);
        }
    }, 3000);
}

async function resolveOwnerLid(sock) {
    if (global.ownerLid) {
        logger.info(`Owner LID (manually set via .env): ${global.ownerLid}`);
        return;
    }

    try {
        const ownerJid = global.owner.includes('@') ? global.owner : `${global.owner}@s.whatsapp.net`;
        const lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(ownerJid);

        if (!lid) {
            logger.warn('Owner LID not mapped yet (WhatsApp hasn\'t sent the mapping data). It will auto-resolve as soon as the owner messages the bot — or set it manually: message the bot, check logs/bot.log for the [owner-check] line → grab the digits from "lid=", put it in .env as OWNER_LID.');
            return;
        }

        global.ownerLid = `${lid.split(':')[0].replace(/@.+/, '')}@lid`;
        logger.info(`Owner LID auto-resolved: ${global.ownerLid} (if this turns out to be wrong, set it manually with OWNER_LID in .env)`);
    } catch (e) {
        logger.warn(`Failed to auto-resolve owner LID: ${e.message}`);
    }
}

function reconnectPlan(code) {
    if (code === DisconnectReason.badSession) {
        return { delay: 3000, note: 'Bad session terdeteksi, reconnect biasa tanpa hapus sesi...' };
    }
    if (code === DisconnectReason.restartRequired) {
        return { delay: 1000, note: 'Restart diperlukan (normal setelah pairing), reconnecting...' };
    }

    retryCount++;
    if (retryCount > MAX_FAST_RETRIES) {
        return { delay: 5000, warn: `Failed to connect ${retryCount}x in a row (code: ${code}), continuing with plain reconnect without deleting the session...` };
    }

    const delay = Math.min(retryCount * 3000, 15_000);
    return { delay, warn: `Reconnect ke-${retryCount} dalam ${delay / 1000}s...` };
}

async function onConnectionClose(lastDisconnect) {
    global.botConnected = false;
    const code = lastDisconnect?.error?.output?.statusCode;
    logger.error(`Connection closed — code: ${code}`);

    if (code === DisconnectReason.loggedOut || code === 401) {
        logger.error('Session logout! Hapus folder session/ lalu restart.');
        return;
    }

    const { delay, note, warn } = reconnectPlan(code);
    if (note) logger.info(note);
    if (warn) logger.warn(warn);
    setTimeout(start, delay);
}

async function onConnectionOpen(sock) {
    retryCount = 0;
    global.botConnected = true;
    logger.success('✅ Bot connected!');

    await initDb();
    await loadPlugins();
    scheduleAutoReset();
    await resolveOwnerLid(sock);

    logger.info(`${plugins.size} commands | Owner: ${global.owner || '(not set)'}`);
}

async function onMessages(sock, msgs) {
    for (const m of msgs) {
        try {
            if (!m?.message) continue;
            cacheMessage(m);
            if (m.key.fromMe) continue;

            const body = extractBody(m);
            if (handleCaptchaAnswer(sock, m, body)) continue;

            await handler(sock, {
                from:     m.key.remoteJid,
                body,
                sender:   { id: m.key.participant || m.key.remoteJid },
                pushname: m.pushName || 'User',
                isGroup:  m.key.remoteJid.endsWith('@g.us'),
                raw:      m,
                device:   detectDevice(m)
            });
        } catch (e) {
            logger.error(`[upsert] ${e.message}`);
        }
    }
}

async function refreshGroupCache(sock, updates) {
    for (const { id } of updates) {
        if (!id) continue;
        try {
            setGroupMetaCache(id, await sock.groupMetadata(id));
        } catch (e) {
            logger.debug(`[groups.update] failed to refresh cache ${id}: ${e.message}`);
        }
    }
}

async function start() {
    const phone = config.pairingNumber;
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const version = await resolveWaVersion();

    logger.info(`WA v${version.join('.')} | Nomor: ${phone}`);

    const sock = makeWASocket({
        version,
        logger:              silentLogger,
        printQRInTerminal:   false,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, silentLogger)
        },
        browser:             Browsers.ubuntu('Chrome'),
        connectTimeoutMs:    60_000,
        keepAliveIntervalMs: 30_000,
        syncFullHistory:     false,
        markOnlineOnConnect: false,
        cachedGroupMetadata: async (jid) => readGroupMetaCache(jid),
        getMessage:          async (key) => getCachedMessage(key)
    });

    global.sock = sock;
    requestPairing(sock, phone);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'close') await onConnectionClose(lastDisconnect);
        else if (connection === 'open') await onConnectionOpen(sock);
    });

    sock.ev.on('messages.upsert', ({ messages }) => onMessages(sock, messages));

    sock.ev.on('group-participants.update', async (event) => {
        try { await participantsUpdate(sock, event); }
        catch (e) { logger.error(`[participants] ${e.message}`); }
    });

    sock.ev.on('groups.update', (updates) => refreshGroupCache(sock, updates));
}

start();
startDashboard(config.dashboardPort);
startIpWatcher(config.dashboardPort);
setInterval(cleanTempFiles, TEMP_CLEAN_INTERVAL);
