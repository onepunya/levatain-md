import { logger } from '../util/index.js';
import {
    extractBody, detectDevice, setGroupMetaCache, cacheMessage
} from '../wa/index.js';
import { handler, participantsUpdate } from '../core/handler.js';
import { handleCaptchaAnswer } from '../groups/groupEvents.js';

const seenIds = new Map();
const SEEN_TTL = 120_000;

function isDuplicate(m) {
    const id = `${m.key?.remoteJid}:${m.key?.id}`;
    const now = Date.now();
    if (seenIds.size > 500) {
        for (const [k, t] of seenIds) if (now - t > SEEN_TTL) seenIds.delete(k);
    }
    if (seenIds.has(id) && now - seenIds.get(id) < SEEN_TTL) return true;
    seenIds.set(id, now);
    return false;
}

const MAX_MSG_AGE_S = 60;

async function onMessages(sock, { messages, type }) {
    if (type !== 'notify') return;
    for (const m of messages) {
        try {
            if (!m?.message) continue;
            const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0);
            if (ts && Date.now() / 1000 - ts > MAX_MSG_AGE_S) continue;
            if (m.key?.id && isDuplicate(m)) continue;
            cacheMessage(m);
            if (m.key.fromMe) continue;

            const body = extractBody(m);
            if (handleCaptchaAnswer(sock, m, body)) continue;

            handler(sock, {
                from: m.key.remoteJid,
                body,
                sender: { id: m.key.participant || m.key.remoteJid },
                pushname: m.pushName || 'User',
                isGroup: m.key.remoteJid.endsWith('@g.us'),
                raw: m,
                device: detectDevice(m)
            }).catch(e => logger.error(`[upsert] ${e.message}`));
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

export function bindSocketEvents(sock, { saveCreds, onOpen, onClose }) {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'close') await onClose(lastDisconnect);
        else if (connection === 'open') await onOpen(sock);
    });

    sock.ev.on('messages.upsert', (u) => onMessages(sock, u));

    sock.ev.on('group-participants.update', async (event) => {
        try { await participantsUpdate(sock, event); }
        catch (e) { logger.error(`[participants] ${e.message}`); }
    });

    sock.ev.on('groups.update', (updates) => refreshGroupCache(sock, updates));
}
