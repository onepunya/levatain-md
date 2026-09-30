const stripDevice = (id, server) => id ? `${id.split(':')[0].replace(/@.+/, '')}${server}` : null;

export function resolveIdentity(sock, m) {
    const { raw, sender } = m;
    const rawParticipant  = raw.key.participant || raw.key.remoteJid || sender.id;
    const altParticipant  = raw.key.participantAlt || raw.key.participantPn;
    const candidates      = [rawParticipant, altParticipant, sender.id].filter(Boolean);

    const lid = stripDevice(candidates.find(v => v.includes('@lid')), '@lid');
    const jid = stripDevice(candidates.find(v => v.includes('@s.whatsapp.net')), '@s.whatsapp.net');

    return {
        lid,
        jid,
        primaryId: lid || jid,
        altId:     lid ? jid : lid,
        senderIds: [lid, jid, sender.id].filter(v => v && !v.includes('undefined')),
        botNumber: `${sock.user?.id?.split(':')[0].replace(/@.+/, '')}@s.whatsapp.net`
    };
}

export function buildQuoted(ctx, from, botSelfIds) {
    const quotedMsg = ctx?.quotedMessage;
    if (!quotedMsg) return null;

    const sender    = ctx.participant || ctx.remoteJid || from;
    const senderAlt = ctx.participantAlt || ctx.participantPn;

    return {
        type:     Object.keys(quotedMsg)[0],
        sender,
        text:     quotedMsg.conversation
                  || quotedMsg.extendedTextMessage?.text
                  || quotedMsg.imageMessage?.caption
                  || quotedMsg.videoMessage?.caption
                  || '',
        fromMe:   botSelfIds.includes(sender) || botSelfIds.includes(senderAlt),
        stanzaId: ctx.stanzaId,
        raw:      { message: quotedMsg, contextInfo: ctx }
    };
}

export function mergeAlternateUser(db, primaryId, altId) {
    const alt = altId && db.users[altId];
    if (!alt) return;

    const main = db.users[primaryId];
    if (!main) {
        db.users[primaryId] = alt;
    } else {
        main.hit          = (main.hit || 0) + (alt.hit || 0);
        main.banned       = Boolean(main.banned || alt.banned);
        main.bannedReason = main.bannedReason || alt.bannedReason || '';
        main.warns        = Math.max(main.warns || 0, alt.warns || 0);
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
        isOwner:    matchesNumbers([global.owner, botNumber]) || Boolean(global.ownerLid && senderIds.includes(global.ownerLid)),
        isAdmin:    isGroup && adminEntries.some(p => matchesParticipant(p, senderIds)),
        isBotAdmin: isGroup && adminEntries.some(p => matchesParticipant(p, [botNumber]))
    };
}
