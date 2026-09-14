import { logger } from './logger.js';

const sessions = new Map();
const DEFAULT_TIMEOUT = 3 * 60_000;

function schedule(jid, session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(async () => {
        sessions.delete(jid);
        try {
            await session.onTimeout?.(session);
        } catch (e) {
            logger.error(`[session] onTimeout ${jid}: ${e.message}`);
        }
    }, session.timeout);
}

export function startSession(jid, data, { timeout = DEFAULT_TIMEOUT, onInput, onTimeout } = {}) {
    endSession(jid);
    const session = { ...data, timeout, onInput, onTimeout, timer: null };
    sessions.set(jid, session);
    schedule(jid, session);
    return session;
}

export function getSession(jid) {
    return sessions.get(jid) || null;
}

export function hasSession(jid) {
    return sessions.has(jid);
}

export function updateSession(jid, patch) {
    const session = sessions.get(jid);
    if (!session) return null;
    Object.assign(session, patch);
    schedule(jid, session);
    return session;
}

export function endSession(jid) {
    const session = sessions.get(jid);
    if (session) clearTimeout(session.timer);
    sessions.delete(jid);
}

export async function routeSessionInput(sock, jid, body, ctx) {
    const session = sessions.get(jid);
    if (!session) return false;

    if (/^(batal|cancel|stop)$/i.test(body.trim())) {
        endSession(jid);
        await sock.sendMessage(ctx.from, { text: '❌ Sesi dibatalkan.' }, { quoted: ctx.raw });
        return true;
    }

    try {
        await session.onInput(sock, body, ctx, session);
    } catch (e) {
        logger.error(`[session] onInput ${jid}: ${e.message}`);
        endSession(jid);
        await sock.sendMessage(ctx.from, { text: `❌ Error: ${e.message}` }, { quoted: ctx.raw });
    }
    return true;
}
