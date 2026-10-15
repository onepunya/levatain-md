export const BANK_MIN = 10;
export const BANK_MAX = 100000;

export function ensureBank(char) {
    if (typeof char.bank !== 'number' || char.bank < 0) char.bank = 0;
    if (typeof char.aether !== 'number' || char.aether < 0) char.aether = 0;
}

export function deposit(char, amount) {
    ensureBank(char);
    amount = Math.floor(Number(amount) || 0);
    if (amount < BANK_MIN) return { ok: false, reason: 'MIN', min: BANK_MIN };
    if ((char.aether || 0) < amount) {
        return { ok: false, reason: 'NO_MONEY', have: char.aether || 0 };
    }
    if ((char.bank || 0) + amount > BANK_MAX) {
        return { ok: false, reason: 'BANK_FULL', max: BANK_MAX, bank: char.bank || 0 };
    }
    char.aether -= amount;
    char.bank = (char.bank || 0) + amount;
    return { ok: true, amount, wallet: char.aether, bank: char.bank };
}

export function withdraw(char, amount) {
    ensureBank(char);
    amount = Math.floor(Number(amount) || 0);
    if (amount < BANK_MIN) return { ok: false, reason: 'MIN', min: BANK_MIN };
    if ((char.bank || 0) < amount) {
        return { ok: false, reason: 'NO_BANK', have: char.bank || 0 };
    }
    char.bank -= amount;
    char.aether = (char.aether || 0) + amount;
    return { ok: true, amount, wallet: char.aether, bank: char.bank };
}

export function depositAll(char) {
    ensureBank(char);
    const amount = Math.floor(char.aether || 0);
    if (amount < BANK_MIN) return { ok: false, reason: 'MIN', min: BANK_MIN };
    return deposit(char, amount);
}

export function withdrawAll(char) {
    ensureBank(char);
    const amount = Math.floor(char.bank || 0);
    if (amount < BANK_MIN) return { ok: false, reason: 'MIN', min: BANK_MIN };
    return withdraw(char, amount);
}
