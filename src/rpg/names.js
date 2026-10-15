export function isUglyId(value) {
    if (value === null || value === undefined) return true;
    const s = String(value).trim();
    if (!s) return true;
    if (s.includes('@')) return true;
    if (/@lid|@s\.whatsapp\.net/i.test(s)) return true;
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length === s.replace(/[\s+\-()]/g, '').length) return true;
    if (/^\d+$/.test(s)) return true;
    return false;
}

export function displayName(db, userId, fallback = 'Player') {
    if (!userId) return fallback;

    let user = db?.users?.[userId] || null;
    if (!user && db?.users) {
        const num = String(userId).replace(/\D/g, '');
        for (const [id, u] of Object.entries(db.users)) {
            if (!u) continue;
            if (id.replace(/\D/g, '') === num) {
                user = u;
                break;
            }
            if (u.jid && u.jid.replace(/\D/g, '') === num) {
                user = u;
                break;
            }
            if (u.lid && String(u.lid).replace(/\D/g, '') === num) {
                user = u;
                break;
            }
        }
    }

    if (!user) return fallback;

    const candidates = [
        user.rpg?.name,
        user.username,
        user.name,
    ];

    for (const c of candidates) {
        if (c && !isUglyId(c)) return String(c).slice(0, 24);
    }

    return fallback;
}

export function safeCharName(char, user, fallback = 'Adventurer') {
    const candidates = [
        char?.name,
        user?.username,
        user?.name,
    ];
    for (const c of candidates) {
        if (c && !isUglyId(c)) return String(c).slice(0, 24);
    }
    return fallback;
}
