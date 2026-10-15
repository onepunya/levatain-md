import { addExp } from './exp.js';
const DAY_MS = 24 * 60 * 60 * 1000;

export const QUEST_DEFS = [
    {
        id: 'hunt_3',
        type: 'hunt_wins',
        target: 3,
        exp: 40,
        aether: 50,
        name: { en: 'Hunter Novice', id: 'Pemburu Pemula' },
        desc: { en: 'Win 3 hunts', id: 'Menang 3x hunt' },
    },
    {
        id: 'hunt_10',
        type: 'hunt_wins',
        target: 10,
        exp: 120,
        aether: 150,
        name: { en: 'Monster Slayer', id: 'Pembasmi Monster' },
        desc: { en: 'Win 10 hunts', id: 'Menang 10x hunt' },
    },
    {
        id: 'earn_200',
        type: 'earn_aether',
        target: 200,
        exp: 60,
        aether: 80,
        name: { en: 'Aether Collector', id: 'Kolektor Aether' },
        desc: { en: 'Earn 200Æ from hunts', id: 'Dapat 200Æ dari hunt' },
    },
    {
        id: 'earn_500',
        type: 'earn_aether',
        target: 500,
        exp: 150,
        aether: 200,
        name: { en: 'Rich Adventurer', id: 'Petualang Kaya' },
        desc: { en: 'Earn 500Æ from hunts', id: 'Dapat 500Æ dari hunt' },
    },
];

export function ensureQuests(char) {
    if (!char.quests || typeof char.quests !== 'object') {
        char.quests = {};
    }
    const now = Date.now();
    const dayKey = Math.floor(now / DAY_MS);

    if (char.quests.dayKey !== dayKey) {
        char.quests = {
            dayKey,
            progress: {},
            claimed: {},
        };
        for (const q of QUEST_DEFS) {
            char.quests.progress[q.id] = 0;
            char.quests.claimed[q.id] = false;
        }
    }

    for (const q of QUEST_DEFS) {
        if (char.quests.progress[q.id] === undefined) char.quests.progress[q.id] = 0;
        if (char.quests.claimed[q.id] === undefined) char.quests.claimed[q.id] = false;
    }
}

export function trackQuest(char, type, amount = 1) {
    ensureQuests(char);
    for (const q of QUEST_DEFS) {
        if (q.type !== type) continue;
        if (char.quests.claimed[q.id]) continue;
        const cur = char.quests.progress[q.id] || 0;
        char.quests.progress[q.id] = Math.min(q.target, cur + amount);
    }
}

export function claimQuest(char, questId) {
    ensureQuests(char);
    const def = QUEST_DEFS.find((q) => q.id === questId);
    if (!def) return { ok: false, reason: 'INVALID' };
    if (char.quests.claimed[questId]) return { ok: false, reason: 'CLAIMED' };
    const prog = char.quests.progress[questId] || 0;
    if (prog < def.target) return { ok: false, reason: 'INCOMPLETE', prog, target: def.target };

    char.quests.claimed[questId] = true;
    char.aether = (char.aether || 0) + def.aether;
    const levelResult = addExp(char, def.exp);
    return { ok: true, def, aether: def.aether, exp: def.exp, levelResult };
}

export function buildQuestText(char, lang = 'id') {
    ensureQuests(char);
    const lines = QUEST_DEFS.map((q) => {
        const prog = char.quests.progress[q.id] || 0;
        const done = char.quests.claimed[q.id];
        const bar = done ? '✅' : prog >= q.target ? '🎁' : '⬜';
        const name = q.name[lang] || q.name.en;
        const desc = q.desc[lang] || q.desc.en;
        return `${bar} *${name}*\n   ${desc}\n   ${prog}/${q.target} · +${q.exp} EXP · +${q.aether}Æ`;
    });
    return lines.join('\n\n');
}
