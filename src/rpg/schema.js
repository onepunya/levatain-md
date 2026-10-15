export const CURRENCY = {
    name: 'Aether',
    symbol: 'Æ',
};

export const CLASSES = {
    swordman: {
        id: 'swordman',
        name: { en: 'Swordman', id: 'Swordman' },
        emoji: '⚔️',
        desc: {
            en: 'Balanced melee fighter. Strong physical attacks.',
            id: 'Pejuang jarak dekat yang seimbang. Serangan fisik kuat.',
        },
        baseStats: { str: 12, agi: 8, vit: 10, int: 4, dex: 7, crt: 5 },
    },
    mage: {
        id: 'mage',
        name: { en: 'Mage', id: 'Mage' },
        emoji: '🔮',
        desc: {
            en: 'Master of elemental magic. High intelligence.',
            id: 'Ahli sihir elemen. Kecerdasan tinggi.',
        },
        baseStats: { str: 4, agi: 6, vit: 6, int: 14, dex: 8, crt: 6 },
    },
    archer: {
        id: 'archer',
        name: { en: 'Archer', id: 'Archer' },
        emoji: '🏹',
        desc: {
            en: 'Ranged specialist. High agility and critical.',
            id: 'Spesialis jarak jauh. Agility dan critical tinggi.',
        },
        baseStats: { str: 7, agi: 12, vit: 7, int: 5, dex: 11, crt: 9 },
    },
    guardian: {
        id: 'guardian',
        name: { en: 'Guardian', id: 'Guardian' },
        emoji: '🛡️',
        desc: {
            en: 'Sturdy tank. High vitality and defense.',
            id: 'Tank kokoh. Vitality dan pertahanan tinggi.',
        },
        baseStats: { str: 9, agi: 5, vit: 14, int: 4, dex: 5, crt: 4 },
    },
};

export const CLASS_LIST = Object.keys(CLASSES);

export const STARTING_AETHER = 500;
export const DAILY_AETHER = 200;
export const MAX_LEVEL = 100;

export function expToNext(level) {
    if (level >= MAX_LEVEL) return 0;
    return Math.floor(50 * level * (1 + level * 0.15));
}

export function createCharacterSchema({ classId, lang = 'id', name = 'Adventurer' }) {
    const cls = CLASSES[classId];
    if (!cls) throw new Error(`Unknown class: ${classId}`);

    return {
        class: classId,
        name: String(name).slice(0, 24),
        lang: lang === 'en' ? 'en' : 'id',
        level: 1,
        exp: 0,
        aether: STARTING_AETHER,
        bank: 0,
        stats: { ...cls.baseStats },
        lastDaily: 0,
        createdAt: Date.now(),
        inventory: [],
        equipment: {},
        quests: {},
        partyId: null,
        guildId: null,
        lastHunt: 0,
    };
}
