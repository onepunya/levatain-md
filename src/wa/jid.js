const SERVERS = new Set(['lid', 's.whatsapp.net']);

export function jidNumber(id = '') {
    return String(id).split('@')[0].split(':')[0];
}

export const jidTag = (id) => `@${jidNumber(id)}`;

export function normalizeJid(raw) {
    if (!raw) return null;
    const [user, server] = String(raw).split('@');
    const base = user.split(':')[0];
    if (SERVERS.has(server) && base) return `${base}@${server}`;
    const digits = base.replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : null;
}

const digitsOf = (v) => String(v || '').replace(/\D/g, '');

export function findParticipant(participants = [], id) {
    const num = digitsOf(jidNumber(id));
    if (!num) return null;
    return participants.find(p =>
        digitsOf(jidNumber(p.id)) === num ||
        digitsOf(jidNumber(p.lid)) === num ||
        digitsOf(jidNumber(p.phoneNumber)) === num
    ) || null;
}
