import { formatDurationWords } from '../lib/index.js';

const INVITE_LINK = /chat\.whatsapp\.com\/(?:invite\/)?[0-9A-Za-z]{20,24}/i;
const AFK_COMMAND = /^\S?afk(\s|$)/i;

const numberOf = (jid) => jid.split('@')[0].split(':')[0];
const tag      = (jid) => `@${jid.split('@')[0]}`;

export async function enforceAntilink(sock, { from, raw, body, primaryId }) {
    if (!INVITE_LINK.test(body)) return false;
    await sock.sendMessage(from, { text: `🚫 Group link detected. ${tag(primaryId)} removed.`, mentions: [primaryId] });
    await sock.sendMessage(from, { delete: raw.key });
    await sock.groupParticipantsUpdate(from, [primaryId], 'remove');
    return true;
}

export async function processAfk(sock, { from, grp, body, primaryId, mentionedJid, quotedSender }) {
    const afk = grp.afk || {};

    if (afk[primaryId] && !AFK_COMMAND.test(body.trim())) {
        const { since } = afk[primaryId];
        delete afk[primaryId];
        await sock.sendMessage(from, {
            text: `👋 ${tag(primaryId)} is back! (AFK for ${formatDurationWords(Date.now() - since)})`,
            mentions: [primaryId]
        });
    }

    const afkIds = Object.keys(afk);
    const targets = new Set();
    for (const jid of [...mentionedJid, quotedSender].filter(Boolean)) {
        const found = afkIds.find(id => numberOf(id) === numberOf(jid));
        if (found) targets.add(found);
    }

    for (const target of targets) {
        const { reason, since } = afk[target];
        await sock.sendMessage(from, {
            text: `💤 ${tag(target)} is AFK${reason ? `: ${reason}` : ''} (${formatDurationWords(Date.now() - since)} ago)`,
            mentions: [target]
        });
    }
}
