const WINDOW_MS = 60 * 60_000;
const usage = new Map();

const prune = (list, now) => {
    while (list.length && now - list[0].at > WINDOW_MS) list.shift();
    return list;
};

export function usedSteps(userId, now = Date.now()) {
    const list = prune(usage.get(userId) || [], now);
    if (!list.length) usage.delete(userId);
    return list.reduce((sum, e) => sum + e.n, 0);
}

export function remainingSteps(userId, perHour, now = Date.now()) {
    return Math.max(0, perHour - usedSteps(userId, now));
}

export function recordSteps(userId, n, now = Date.now()) {
    if (!n) return;
    const list = prune(usage.get(userId) || [], now);
    list.push({ at: now, n });
    usage.set(userId, list);
    if (usage.size > 5000) {
        for (const [id, l] of usage) if (!prune(l, now).length) usage.delete(id);
    }
}

export const _reset = () => usage.clear();
