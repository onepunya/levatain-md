import { expToNext, MAX_LEVEL } from './schema.js';

export function addExp(char, amount) {
    const oldLevel = char.level;
    let remaining = Math.max(0, Math.floor(amount));

    while (remaining > 0 && char.level < MAX_LEVEL) {
        const need = expToNext(char.level);
        if (char.exp + remaining < need) {
            char.exp += remaining;
            remaining = 0;
            break;
        }
        remaining -= need - char.exp;
        char.exp = 0;
        char.level += 1;
        growStats(char);
    }

    if (char.level >= MAX_LEVEL) {
        char.level = MAX_LEVEL;
        char.exp = 0;
    }

    return {
        leveled: char.level > oldLevel,
        levelsGained: char.level - oldLevel,
        newLevel: char.level,
        oldLevel,
    };
}

function growStats(char) {
    const growth = {
        swordman: { str: 2, vit: 1, agi: 1 },
        mage: { int: 2, dex: 1, vit: 1 },
        archer: { agi: 2, dex: 1, crt: 1 },
        guardian: { vit: 2, str: 1, dex: 1 },
    };
    const g = growth[char.class] || { str: 1, vit: 1 };
    for (const [k, v] of Object.entries(g)) {
        char.stats[k] = (char.stats[k] || 0) + v;
    }
}

export function expProgress(char) {
    if (char.level >= MAX_LEVEL) {
        return { current: 0, needed: 0, percent: 100 };
    }
    const needed = expToNext(char.level);
    const percent = needed ? Math.min(100, Math.floor((char.exp / needed) * 100)) : 100;
    return { current: char.exp, needed, percent };
}
