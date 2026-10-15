import { ITEMS, getItem, SLOTS, MAX_INVENTORY, RARITY } from './items.js';

export function ensureInv(char) {
    if (!Array.isArray(char.inventory)) char.inventory = [];
    if (!char.equipment || typeof char.equipment !== 'object') {
        char.equipment = { weapon: null, armor: null, accessory: null };
    }
    for (const s of SLOTS) {
        if (!(s in char.equipment)) char.equipment[s] = null;
    }
}

export function invCount(char) {
    ensureInv(char);
    return char.inventory.reduce((n, e) => n + (e.qty || 1), 0);
}

export function findInvEntry(char, itemId) {
    ensureInv(char);
    return char.inventory.find((e) => e.id === itemId) || null;
}

export function addItem(char, itemId, qty = 1) {
    ensureInv(char);
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'INVALID' };
    const space = MAX_INVENTORY - invCount(char);
    if (space <= 0) return { ok: false, reason: 'FULL' };
    const add = Math.min(qty, space);
    const entry = findInvEntry(char, itemId);
    if (entry) {
        entry.qty = (entry.qty || 1) + add;
    } else {
        char.inventory.push({ id: itemId, qty: add });
    }
    return { ok: true, added: add, item };
}

export function removeItem(char, itemId, qty = 1) {
    ensureInv(char);
    const entry = findInvEntry(char, itemId);
    if (!entry || (entry.qty || 1) < qty) return { ok: false, reason: 'NOT_FOUND' };
    entry.qty = (entry.qty || 1) - qty;
    if (entry.qty <= 0) {
        char.inventory = char.inventory.filter((e) => e.id !== itemId);
    }
    return { ok: true };
}

export function equipItem(char, itemId) {
    ensureInv(char);
    const item = getItem(itemId);
    if (!item || item.type !== 'equipment' || !item.slot) {
        return { ok: false, reason: 'NOT_EQUIPMENT' };
    }
    if ((char.level || 1) < (item.reqLevel || 1)) {
        return { ok: false, reason: 'LEVEL', req: item.reqLevel };
    }
    const entry = findInvEntry(char, itemId);
    if (!entry) return { ok: false, reason: 'NOT_FOUND' };

    const slot = item.slot;
    const previous = char.equipment[slot];
    if (previous) {
        addItem(char, previous, 1);
    }
    removeItem(char, itemId, 1);
    char.equipment[slot] = itemId;
    return { ok: true, item, previous, slot };
}

export function unequipSlot(char, slot) {
    ensureInv(char);
    if (!SLOTS.includes(slot)) return { ok: false, reason: 'BAD_SLOT' };
    const current = char.equipment[slot];
    if (!current) return { ok: false, reason: 'EMPTY' };
    if (invCount(char) >= MAX_INVENTORY) return { ok: false, reason: 'FULL' };
    addItem(char, current, 1);
    char.equipment[slot] = null;
    return { ok: true, itemId: current, slot };
}

export function getEquipmentBonuses(char) {
    ensureInv(char);
    const bonus = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, crt: 0 };
    for (const slot of SLOTS) {
        const id = char.equipment[slot];
        if (!id) continue;
        const item = getItem(id);
        if (!item?.stats) continue;
        for (const [k, v] of Object.entries(item.stats)) {
            bonus[k] = (bonus[k] || 0) + v;
        }
    }
    return bonus;
}

export function getEffectiveStats(char) {
    const base = { ...(char.stats || {}) };
    const bonus = getEquipmentBonuses(char);
    const out = {};
    for (const k of ['str', 'agi', 'vit', 'int', 'dex', 'crt']) {
        out[k] = (base[k] || 0) + (bonus[k] || 0);
    }
    return out;
}

export function buildInventoryText(char, lang = 'id') {
    ensureInv(char);
    const lines = [];
    if (!char.inventory.length) {
        lines.push(lang === 'en' ? '_Empty inventory_' : '_Inventory kosong_');
    } else {
        for (const entry of char.inventory) {
            const item = getItem(entry.id);
            if (!item) continue;
            const rar = RARITY[item.rarity] || RARITY.common;
            const name = item.name[lang] || item.name.en;
            const qty = entry.qty > 1 ? ` x${entry.qty}` : '';
            const slotTag = item.slot ? ` [${item.slot}]` : '';
            lines.push(`${rar.color}${item.emoji} *${name}*${qty}${slotTag}`);
        }
    }
    return lines.join('\n');
}

export function buildEquipmentText(char, lang = 'id') {
    ensureInv(char);
    const labels = {
        weapon: { en: 'Weapon', id: 'Senjata' },
        armor: { en: 'Armor', id: 'Armor' },
        accessory: { en: 'Accessory', id: 'Aksesori' },
    };
    const lines = [];
    for (const slot of SLOTS) {
        const id = char.equipment[slot];
        const label = labels[slot][lang] || labels[slot].en;
        if (!id) {
            lines.push(`• ${label}: _—_`);
            continue;
        }
        const item = getItem(id);
        if (!item) {
            lines.push(`• ${label}: _—_`);
            continue;
        }
        const name = item.name[lang] || item.name.en;
        lines.push(`• ${label}: ${item.emoji} *${name}*`);
    }
    return lines.join('\n');
}

export { SLOTS, MAX_INVENTORY, RARITY, ITEMS, getItem };
