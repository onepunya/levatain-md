const groupMetaCache = new Map();
const GROUP_META_TTL = 5 * 60_000;

export async function getGroupMeta(sock, groupId) {
    const cached = groupMetaCache.get(groupId);
    if (cached && Date.now() - cached.time < GROUP_META_TTL) return cached.data;
    try {
        const data = await sock.groupMetadata(groupId);
        groupMetaCache.set(groupId, { data, time: Date.now() });
        return data;
    } catch {
        return cached?.data || null;
    }
}

export function readGroupMetaCache(groupId) {
    return groupMetaCache.get(groupId)?.data;
}

export function setGroupMetaCache(groupId, data) {
    groupMetaCache.set(groupId, { data, time: Date.now() });
}

export function bustGroupMetaCache(groupId) {
    groupMetaCache.delete(groupId);
}
