export const MONSTERS = {
    slime: {
        id: 'slime',
        emoji: '🟢',
        name: { en: 'Slime', id: 'Slime' },
        minLevel: 1,
        maxLevel: 8,
        hp: 100,
        atk: 14,
        exp: 18,
        aether: [5, 15],
    },
    wolf: {
        id: 'wolf',
        emoji: '🐺',
        name: { en: 'Wolf', id: 'Serigala' },
        minLevel: 3,
        maxLevel: 12,
        hp: 160,
        atk: 22,
        exp: 32,
        aether: [10, 25],
    },
    goblin: {
        id: 'goblin',
        emoji: '👺',
        name: { en: 'Goblin', id: 'Goblin' },
        minLevel: 5,
        maxLevel: 18,
        hp: 230,
        atk: 30,
        exp: 48,
        aether: [15, 35],
    },
    skeleton: {
        id: 'skeleton',
        emoji: '💀',
        name: { en: 'Skeleton', id: 'Tengkorak' },
        minLevel: 10,
        maxLevel: 25,
        hp: 320,
        atk: 40,
        exp: 70,
        aether: [20, 50],
    },
    orc: {
        id: 'orc',
        emoji: '👹',
        name: { en: 'Orc', id: 'Orc' },
        minLevel: 15,
        maxLevel: 35,
        hp: 480,
        atk: 52,
        exp: 110,
        aether: [30, 70],
    },
    wyvern: {
        id: 'wyvern',
        emoji: '🐉',
        name: { en: 'Wyvern', id: 'Wyvern' },
        minLevel: 25,
        maxLevel: 50,
        hp: 750,
        atk: 72,
        exp: 180,
        aether: [50, 120],
    },
    demon: {
        id: 'demon',
        emoji: '😈',
        name: { en: 'Demon', id: 'Iblis' },
        minLevel: 40,
        maxLevel: 70,
        hp: 1150,
        atk: 100,
        exp: 280,
        aether: [80, 200],
    },
    dragon: {
        id: 'dragon',
        emoji: '🔥',
        name: { en: 'Dragon', id: 'Naga' },
        minLevel: 60,
        maxLevel: 100,
        hp: 1800,
        atk: 135,
        exp: 450,
        aether: [150, 400],
    },
};

export const MONSTER_LIST = Object.keys(MONSTERS);

export function getMonstersForLevel(level) {
    return MONSTER_LIST
        .map((id) => MONSTERS[id])
        .filter((m) => level >= m.minLevel && level <= m.maxLevel + 5);
}

export function pickMonster(level, preferredId) {
    if (preferredId && MONSTERS[preferredId]) {
        const m = MONSTERS[preferredId];
        if (level < m.minLevel) return { error: 'TOO_WEAK', monster: m };
        return { monster: m };
    }
    const pool = getMonstersForLevel(level);
    if (!pool.length) {
        return { monster: MONSTERS.slime };
    }
    const m = pool[Math.floor(Math.random() * pool.length)];
    return { monster: m };
}

export function scaleMonster(base, playerLevel) {
    const span = Math.max(1, base.maxLevel - base.minLevel);
    const t = Math.max(0, Math.min(1, (playerLevel - base.minLevel) / span));
    const ratio = 0.8 + t * 0.45;
    const enraged = Math.random() < 0.12;
    const boost = enraged ? 1.3 : 1;
    return {
        ...base,
        hp: Math.floor(base.hp * ratio * boost),
        atk: Math.floor(base.atk * ratio * boost),
        exp: Math.floor(base.exp * (0.9 + t * 0.3) * (enraged ? 1.4 : 1)),
        aetherMin: base.aether[0],
        aetherMax: base.aether[1],
        enraged,
    };
}
