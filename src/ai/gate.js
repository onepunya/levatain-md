const TRIGGER_WORDS   = /\b(lev|levatain|leva)\b/i;
const TRIGGER_WORDS_G = /\b(lev|levatain|leva)\b/gi;

const COOLDOWN_MS = 3000;
const cooldowns   = new Map();

export function shouldHandleAI(body, ctx) {
    const { isGroup, isMentioned, isQuotedFromBot } = ctx;

    if (!isGroup) return true;

    if (TRIGGER_WORDS.test(body.trim()))    return true;
    if (isMentioned)                         return true;
    if (isQuotedFromBot)                     return true;

    return false;
}

export function cleanTrigger(body) {
    return body.replace(TRIGGER_WORDS_G, '').replace(/\s+/g, ' ').trim();
}

export function isOnCooldown(userId) {
    const last = cooldowns.get(userId) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    cooldowns.set(userId, Date.now());
    return false;
}
