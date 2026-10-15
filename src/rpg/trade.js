export function normalizeTarget(raw) {
    if (!raw) return null;
    const s = String(raw).split(':')[0];
    if (s.includes('@lid') || s.includes('@s.whatsapp.net')) return s;
    const num = s.replace(/\D/g, '');
    if (!num) return null;
    return `${num}@s.whatsapp.net`;
}

export function resolveTargetId({ message, mentionedJid, primaryId, body }) {
    if (message?.quoted?.sender) {
        return normalizeTarget(message.quoted.sender);
    }
    if (mentionedJid?.[0]) {
        return normalizeTarget(mentionedJid[0]);
    }
    const parts = (body || '').trim().split(/\s+/).slice(1);
    for (const p of parts) {
        if (p.startsWith('@')) continue;
        const n = p.replace(/\D/g, '');
        if (n.length >= 8 && n.length <= 15) {
            return normalizeTarget(n);
        }
    }
    return null;
}

export function findUserInDb(gdb, targetId) {
    if (!targetId || !gdb?.users) return null;
    if (gdb.users[targetId]) return { id: targetId, user: gdb.users[targetId] };

    const num = targetId.replace(/\D/g, '');
    for (const [id, user] of Object.entries(gdb.users)) {
        if (!user) continue;
        if (id.replace(/\D/g, '') === num) return { id, user };
        if (user.jid && user.jid.replace(/\D/g, '') === num) return { id, user };
        if (user.lid && user.lid.replace(/\D/g, '') === num) return { id, user };
    }
    return null;
}
