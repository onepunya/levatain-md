import { ITEMS, ITEM_LIST, getItem } from './items.js';
import { addItem, removeItem, findInvEntry, invCount, MAX_INVENTORY, ensureInv } from './inventory.js';
import { RARITY } from './items.js';

export const BUY_MULTIPLIER = 3;

export function getBuyPrice(item) {
    return Math.floor((item.sell || 10) * BUY_MULTIPLIER);
}

export function getShopCatalog() {
    return ITEM_LIST
        .map((id) => ITEMS[id])
        .filter((item) => item.type === 'equipment' || item.id === 'aether_crystal')
        .sort((a, b) => getBuyPrice(a) - getBuyPrice(b));
}

export function buyItem(char, itemId, qty = 1) {
    ensureInv(char);
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'INVALID' };
    if (item.type !== 'equipment' && item.id !== 'aether_crystal') {
        return { ok: false, reason: 'NOT_FOR_SALE' };
    }

    qty = Math.max(1, Math.min(10, Math.floor(qty) || 1));
    const price = getBuyPrice(item) * qty;
    if ((char.aether || 0) < price) {
        return { ok: false, reason: 'NO_MONEY', need: price, have: char.aether || 0 };
    }

    const space = MAX_INVENTORY - invCount(char);
    if (space < qty) return { ok: false, reason: 'FULL' };

    const res = addItem(char, itemId, qty);
    if (!res.ok) return res;

    char.aether = (char.aether || 0) - price;
    return { ok: true, item, qty, price, balance: char.aether };
}

export function sellItem(char, itemId, qty = 1) {
    ensureInv(char);
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'INVALID' };

    qty = Math.max(1, Math.floor(qty) || 1);
    const entry = findInvEntry(char, itemId);
    if (!entry || (entry.qty || 1) < qty) {
        return { ok: false, reason: 'NOT_FOUND' };
    }

    const gain = (item.sell || 1) * qty;
    const res = removeItem(char, itemId, qty);
    if (!res.ok) return res;

    char.aether = (char.aether || 0) + gain;
    return { ok: true, item, qty, gain, balance: char.aether };
}

export function buildShopText(lang = 'id') {
    const catalog = getShopCatalog();
    const lines = catalog.map((item) => {
        const rar = RARITY[item.rarity] || RARITY.common;
        const name = item.name[lang] || item.name.en;
        const price = getBuyPrice(item);
        const stats = Object.entries(item.stats || {})
            .filter(([, v]) => v)
            .map(([k, v]) => `${k.toUpperCase()}+${v}`)
            .join(' ');
        const statStr = stats ? ` · ${stats}` : '';
        return `${rar.color}${item.emoji} *${item.id}*\n   ${name} — ${price}Æ (Lv${item.reqLevel || 1})${statStr}`;
    });
    return lines.join('\n\n');
}

export function transferAether(fromChar, toChar, amount) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return { ok: false, reason: 'BAD_AMOUNT' };
    if ((fromChar.aether || 0) < amount) {
        return { ok: false, reason: 'NO_MONEY', have: fromChar.aether || 0 };
    }
    fromChar.aether -= amount;
    toChar.aether = (toChar.aether || 0) + amount;
    return { ok: true, amount, fromBal: fromChar.aether, toBal: toChar.aether };
}

export function transferItem(fromChar, toChar, itemId, qty = 1) {
    ensureInv(fromChar);
    ensureInv(toChar);
    qty = Math.max(1, Math.floor(qty) || 1);
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'INVALID' };

    const entry = findInvEntry(fromChar, itemId);
    if (!entry || (entry.qty || 1) < qty) {
        return { ok: false, reason: 'NOT_FOUND' };
    }

    const space = MAX_INVENTORY - invCount(toChar);
    if (space < qty) return { ok: false, reason: 'TARGET_FULL' };

    removeItem(fromChar, itemId, qty);
    addItem(toChar, itemId, qty);
    return { ok: true, item, qty };
}
