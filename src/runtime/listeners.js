import { logger } from '../util/index.js';
import {
    extractBody, detectDevice, setGroupMetaCache, cacheMessage
} from '../wa/index.js';
import { handler, participantsUpdate } from '../core/handler.js';
import { handleCaptchaAnswer } from '../groups/groupEvents.js';

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


export function bindSocketEvents(sock, { saveCreds, onOpen, onClose }) {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'close') await onClose(lastDisconnect);
        else if (connection === 'open') await onOpen(sock);
    });

    sock.ev.on('messages.upsert', ({ messages }) => onMessages(sock, messages));

    sock.ev.on('group-participants.update', async (event) => {
        try { await participantsUpdate(sock, event); }
        catch (e) { logger.error(`[participants] ${e.message}`); }
    });

    sock.ev.on('groups.update', (updates) => refreshGroupCache(sock, updates));
}
