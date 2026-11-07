import { normalizeJid, jidTag, findParticipant, jidNumber } from '../wa/jid.js';

const stripDevice = (id, server) => id ? `${id.split(':')[0].replace(/@.+/, '')}${server}` : null;

export function resolveIdentity(sock, m) {
    const { raw, sender } = m;
    const rawParticipant = raw.key.participant || raw.key.remoteJid || sender.id;
    const altParticipant = raw.key.participantAlt || raw.key.participantPn;
    const candidates = [rawParticipant, altParticipant, sender.id].filter(Boolean);

    const lid = stripDevice(candidates.find(v => v.includes('@lid')), '@lid');
    const jid = stripDevice(candidates.find(v => v.includes('@s.whatsapp.net')), '@s.whatsapp.net');

    return {
        lid,
        jid,
        primaryId: lid || jid,
        altId: lid ? jid : lid,
        senderIds: [lid, jid, sender.id].filter(v => v && !v.includes('undefined')),
        botNumber: `${sock.user?.id?.split(':')[0].replace(/@.+/, '')}@s.whatsapp.net`,
        botNums: botNumbersOf(sock)
    };
}

export function botNumbersOf(sock) {
    return [sock.user?.id, sock.user?.lid, sock.authState?.creds?.me?.id, sock.authState?.creds?.me?.lid]
        .filter(Boolean)
        .map(jidNumber)
        .filter((v, i, a) => v && a.indexOf(v) === i);
}

const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage'];

export function unwrapMessage(message) {
    let cur = message;
    for (let i = 0; i < 5 && cur; i++) {
        const key = WRAPPERS.find(k => cur[k]?.message);
        if (!key) break;
        cur = cur[key].message;
    }
    return cur || null;
}

export function getContextInfo(message) {
    const inner = unwrapMessage(message);
    if (!inner) return null;
    for (const [key, value] of Object.entries(inner)) {
        if (key === 'messageContextInfo' || key === 'senderKeyDistributionMessage') continue;
        if (value && typeof value === 'object' && value.contextInfo) return value.contextInfo;
    }
    return null;
}

export function mentionsBot(mentionedJid, botNums) {
    return (mentionedJid || []).some(j => botNums.includes(jidNumber(j)));
}

export function buildQuoted(ctx, from, botSelfIds) {
    const quotedMsg = ctx?.quotedMessage;
    if (!quotedMsg) return null;

    const botNums = botSelfIds.filter(Boolean).map(jidNumber);

    const sender = ctx.participant || ctx.remoteJid || from;
    const senderAlt = ctx.participantAlt || ctx.participantPn;

    return {
        type: Object.keys(quotedMsg)[0],
        sender,
        text: quotedMsg.conversation
                  || quotedMsg.extendedTextMessage?.text
                  || quotedMsg.imageMessage?.caption
                  || quotedMsg.videoMessage?.caption
                  || '',
        fromMe: [sender, senderAlt].filter(Boolean).some(id => botNums.includes(jidNumber(id))),
        stanzaId: ctx.stanzaId,
        raw: { message: quotedMsg, contextInfo: ctx }
    };
}

export function mergeAlternateUser(db, primaryId, altId) {
    const alt = altId && db.users[altId];
    if (!alt) return;

    const main = db.users[primaryId];
    if (!main) {
        db.users[primaryId] = alt;
    } else {
        main.hit = (main.hit || 0) + (alt.hit || 0);
        main.banned = Boolean(main.banned || alt.banned);
        main.bannedReason = main.bannedReason || alt.bannedReason || '';
        main.warns = Math.max(main.warns || 0, alt.warns || 0);
    }
    delete db.users[altId];
}

const matchesParticipant = (p, ids) => ids.some(id => {
    const num = id.split('@')[0];
    return p.id?.includes(num) || p.lid?.includes(num) || p.phoneNumber?.includes(num);
});

export function resolvePermissions({ senderIds, botNumber, adminEntries, isGroup }) {
    const matchesNumbers = (list) => {
        const nums = list.filter(Boolean).map(v => v.toString().replace(/\D/g, ''));
        return senderIds.some(sid => nums.some(n => n && sid.includes(n)));
    };

    return {
        isOwner: matchesNumbers([global.owner, botNumber]) || Boolean(global.ownerLid && senderIds.includes(global.ownerLid)),
        isAdmin: isGroup && adminEntries.some(p => matchesParticipant(p, senderIds)),
        isBotAdmin: isGroup && adminEntries.some(p => matchesParticipant(p, [botNumber]))
    };
}

export function resolveTarget({ message, mentionedJid, participants = [], body = '' }, { allowNumber = false } = {}) {
    let id = normalizeJid(message?.quoted?.sender) || normalizeJid(mentionedJid?.[0]);

    if (!id && allowNumber) {
        const digits = String(body).trim().split(/\s+/).slice(1)
            .filter(p => !p.startsWith('@'))
            .map(p => p.replace(/\D/g, ''))
            .find(d => d.length >= 8 && d.length <= 15);
        if (digits) id = `${digits}@s.whatsapp.net`;
    }

    return id ? { id, tag: jidTag(id), participant: findParticipant(participants, id) } : null;
}
