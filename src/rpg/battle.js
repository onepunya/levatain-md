import { pickMonster, scaleMonster, MONSTERS, MONSTER_LIST } from './monsters.js';
import { addExp } from './exp.js';
import { trackQuest } from './quests.js';
import { getParty, partyExpBonus } from './party.js';
import { getEffectiveStats } from './inventory.js';
import { rollDrops } from './items.js';
import { addItem } from './inventory.js';

const HUNT_COOLDOWN_MS = 45_000;
const activeHunts = new Map();

export function isHunting(primaryId) {
    return activeHunts.has(primaryId);
}

export function setHunting(primaryId, val) {
    if (val) activeHunts.set(primaryId, true);
    else activeHunts.delete(primaryId);
}

export function canHunt(char) {
    const now = Date.now();
    const last = char.lastHunt || 0;
    const left = HUNT_COOLDOWN_MS - (now - last);
    if (left > 0) return { ok: false, waitMs: left };
    return { ok: true };
}

export function playerAtk(char) {
    const s = getEffectiveStats(char);
    const cls = char.class;
    let base = 8;
    if (cls === 'swordman') base = (s.str || 0) * 1.15 + (s.dex || 0) * 0.3;
    else if (cls === 'mage') base = (s.int || 0) * 1.25 + (s.dex || 0) * 0.25;
    else if (cls === 'archer') base = (s.agi || 0) * 1.0 + (s.dex || 0) * 0.85;
    else if (cls === 'guardian') base = (s.str || 0) * 0.9 + (s.vit || 0) * 0.35;
    else base = (s.str || 0) * 0.9 + (s.int || 0) * 0.5;
    return Math.floor(base + char.level * 1.5);
}

export function playerDef(char) {
    const s = getEffectiveStats(char);
    return Math.floor((s.vit || 0) * 0.65 + char.level * 1.3);
}

export function playerMaxHp(char) {
    const s = getEffectiveStats(char);
    return Math.floor(70 + (s.vit || 0) * 5.5 + char.level * 11);
}

function rollCrit(char) {
    const s = getEffectiveStats(char);
    const crt = s.crt || 0;
    const chance = Math.min(40, 5 + crt * 1.2);
    return Math.random() * 100 < chance;
}

function damageRange(atk, def) {
    const raw = Math.max(1, atk - def * 0.22);
    const variance = 0.8 + Math.random() * 0.4;
    return Math.max(1, Math.floor(raw * variance));
}

export function resolveBattle(char, preferredId) {
    const picked = pickMonster(char.level, preferredId);
    if (picked.error === 'TOO_WEAK') {
        return { error: 'TOO_WEAK', monster: picked.monster };
    }

    const mon = scaleMonster(picked.monster, char.level);
    const pAtk = playerAtk(char);
    const pDef = playerDef(char);
    let pHp = playerMaxHp(char);
    let mHp = mon.hp;
    const log = [];
    let turns = 0;
    const maxTurns = 24;

    while (pHp > 0 && mHp > 0 && turns < maxTurns) {
        turns++;
        const crit = rollCrit(char);
        let dmg = damageRange(pAtk, Math.floor(mon.atk * 0.12));
        if (crit) dmg = Math.floor(dmg * 1.55);
        mHp -= dmg;
        log.push({ actor: 'player', dmg, crit, mHp: Math.max(0, mHp) });

        if (mHp <= 0) break;

        const mDmg = damageRange(mon.atk, pDef);
        pHp -= mDmg;
        log.push({ actor: 'monster', dmg: mDmg, pHp: Math.max(0, pHp) });
    }

    const won = mHp <= 0 && pHp > 0;
    const fled = turns >= maxTurns && mHp > 0 && pHp > 0;

    let expGain = 0;
    let aetherGain = 0;
    let levelResult = null;
    const drops = [];

    if (won) {
        expGain = mon.exp;
        aetherGain = mon.aetherMin + Math.floor(Math.random() * (mon.aetherMax - mon.aetherMin + 1));
        char.aether = (char.aether || 0) + aetherGain;

        if (global.db) {
            const party = getParty(global.db, char);
            if (party) {
                const bonus = partyExpBonus(party.members.length);
                expGain = Math.floor(expGain * (1 + bonus));
            }
        }

        levelResult = addExp(char, expGain);
        trackQuest(char, 'hunt_wins', 1);
        trackQuest(char, 'earn_aether', aetherGain);

        const rolled = rollDrops(mon.id);
        for (const itemId of rolled) {
            const res = addItem(char, itemId, 1);
            if (res.ok) drops.push(itemId);
        }
    } else if (fled) {
        expGain = Math.floor(mon.exp * 0.15);
        levelResult = addExp(char, expGain);
    } else {
        expGain = Math.floor(mon.exp * 0.1);
        levelResult = addExp(char, expGain);
    }

    char.lastHunt = Date.now();

    return {
        won,
        fled,
        monster: mon,
        expGain,
        aetherGain,
        levelResult,
        turns,
        log,
        drops,
        playerHpLeft: Math.max(0, pHp),
        playerHpMax: playerMaxHp(char),
    };
}

export function formatWaitShort(ms) {
    const s = Math.ceil(ms / 1000);
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
}

export { MONSTERS, MONSTER_LIST, HUNT_COOLDOWN_MS };
