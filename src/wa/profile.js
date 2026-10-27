const clean = (v, max) => {
    const s = v == null ? '' : String(v).trim();
    return s ? (max ? s.slice(0, max) : s) : null;
};

export async function getAbout(sock, jid, max) {
    try {
        const res = await sock.fetchStatus(jid);
        const entry = Array.isArray(res) ? res[0] : res;
        const status = entry?.status;
        return clean(typeof status === 'string' ? status : status?.status ?? entry?.statusText, max);
    } catch {
        return null;
    }
}

export async function getAvatarUrl(sock, jid) {
    try {
        return (await sock.profilePictureUrl(jid, 'image')) || null;
    } catch {
        return null;
    }
}

export async function getBusiness(sock, jid) {
    try {
        const biz = await sock.getBusinessProfile?.(jid);
        if (!biz || !(biz.description || biz.category || biz.email || biz.website || biz.address)) return null;
        return {
            description: clean(biz.description, 220),
            category: biz.category || biz.business_category || null,
            email: biz.email || null,
            website: biz.website || null,
        };
    } catch {
        return null;
    }
}
