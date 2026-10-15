import { createCharacterSchema, CLASSES, CLASS_LIST, DAILY_AETHER } from './schema.js';
import { formatAether } from './currency.js';
import { expProgress } from './exp.js';
import { t } from './i18n.js';
import { saveDb } from '../storage/db.js';
import { getEffectiveStats, buildEquipmentText, ensureInv } from './inventory.js';
import { safeCharName } from './names.js';
import { ensureBank } from './bank.js';

export function getCharacter(user) {
    return user?.rpg && user.rpg.class ? user.rpg : null;
}

export function hasCharacter(user) {
    return !!getCharacter(user);
}

export function createCharacter(user, { classId, lang, name }) {
    if (!CLASS_LIST.includes(classId)) {
        throw new Error('INVALID_CLASS');
    }
    const char = createCharacterSchema({
        classId,
        lang: lang === 'en' ? 'en' : 'id',
        name: safeCharName({ name }, user, 'Adventurer'),
    });
    user.rpg = char;
    return char;
}

export function setLanguage(char, lang) {
    char.lang = lang === 'en' ? 'en' : 'id';
    return char.lang;
}

export function claimDaily(char) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsed = now - (char.lastDaily || 0);

    if (elapsed < dayMs) {
        return { ok: false, waitMs: dayMs - elapsed };
    }

    char.aether = (char.aether || 0) + DAILY_AETHER;
    char.lastDaily = now;
    return { ok: true, amount: DAILY_AETHER, total: char.aether };
}

export function formatWait(ms) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function buildProfile(char, displayName) {
    const lang = char.lang || 'id';
    const cls = CLASSES[char.class];
    const className = cls ? cls.name[lang] : char.class;
    const emoji = cls?.emoji || '⚔️';
    const prog = expProgress(char);
    const stats = getEffectiveStats(char);
    ensureInv(char);
    ensureBank(char);

    const lines = [
        t('profile_title', lang),
        `━━━━━━━━━━━━━━━━`,
        `${emoji} *${safeCharName(char, { name: displayName, username: displayName }, 'Adventurer')}*`,
        `🏷️ Class  : *${className}*`,
        `📊 Level  : *${char.level}*`,
        `✨ EXP    : ${prog.current} / ${prog.needed} (${prog.percent}%)`,
        `💰 Aether : *${formatAether(char.aether)}*`,
        `🏦 Bank   : *${formatAether(char.bank || 0)}*`,
        ``,
        `*Stats*`,
        `STR ${stats.str ?? 0}  AGI ${stats.agi ?? 0}  VIT ${stats.vit ?? 0}`,
        `INT ${stats.int ?? 0}  DEX ${stats.dex ?? 0}  CRT ${stats.crt ?? 0}`,
        ``,
        `*Equipment*`,
        buildEquipmentText(char, lang),
        `━━━━━━━━━━━━━━━━`,
        `🌐 Lang: ${lang === 'en' ? 'English' : 'Indonesia'}  ·  *.setlang en/id*`,
    ];

    return lines.join('\n');
}

export async function persist() {
    await saveDb();
}

export { CLASSES, CLASS_LIST, DAILY_AETHER };
