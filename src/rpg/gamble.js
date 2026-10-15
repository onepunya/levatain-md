export const GAMBLE_MIN = 10;
export const GAMBLE_MAX = 500;
export const GAMBLE_COOLDOWN_MS = 20_000;
export const COIN_MULTIPLIER = 1.9;

const lastGamble = new Map();

export function canGamble(primaryId) {
    const last = lastGamble.get(primaryId) || 0;
    const left = GAMBLE_COOLDOWN_MS - (Date.now() - last);
    if (left > 0) return { ok: false, waitMs: left };
    return { ok: true };
}

export function markGamble(primaryId) {
    lastGamble.set(primaryId, Date.now());
}

export function parseBet(raw, wallet) {
    const n = Math.floor(Number(raw) || 0);
    if (n < GAMBLE_MIN) return { ok: false, reason: 'MIN' };
    if (n > GAMBLE_MAX) return { ok: false, reason: 'MAX' };
    if (n > (wallet || 0)) return { ok: false, reason: 'NO_MONEY', have: wallet || 0 };
    return { ok: true, amount: n };
}

export function coinFlip(char, amount, pick) {
    const side = String(pick || '').toLowerCase();
    const valid = ['h', 'head', 'heads', 'a', 'angka', 't', 'tail', 'tails', 'g', 'gambar'];
    if (!valid.includes(side)) return { ok: false, reason: 'BAD_PICK' };

    const playerHeads = ['h', 'head', 'heads', 'a', 'angka'].includes(side);
    const resultHeads = Math.random() < 0.5;
    const win = playerHeads === resultHeads;

    char.aether = (char.aether || 0) - amount;
    let payout = 0;
    if (win) {
        payout = Math.floor(amount * COIN_MULTIPLIER);
        char.aether += payout;
    }

    return {
        ok: true,
        win,
        amount,
        payout,
        result: resultHeads ? 'heads' : 'tails',
        pick: playerHeads ? 'heads' : 'tails',
        wallet: char.aether,
    };
}

export function formatWaitShort(ms) {
    const s = Math.ceil(ms / 1000);
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
}
