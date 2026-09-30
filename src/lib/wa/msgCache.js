const MAX_ENTRIES = 5000;
const store = new Map();

export function cacheMessage(m) {
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
    store.set(m.key.id, m);
}

export const getCachedMessage = (key) => store.get(key.id)?.message || undefined;
