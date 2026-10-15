import { getEffectiveStats } from './inventory.js';
import { playerAtk, playerDef, playerMaxHp } from './battle.js';
import { formatAether } from './currency.js';
import { CLASSES } from './schema.js';
import { safeCharName } from './names.js';

export function calcPower(char) {
    const atk = playerAtk(char);
    const def = playerDef(char);
    const hp = playerMaxHp(char);
    const s = getEffectiveStats(char);
    const statSum = (s.str || 0) + (s.agi || 0) + (s.vit || 0) + (s.int || 0) + (s.dex || 0) + (s.crt || 0);
    return Math.floor(atk * 2 + def * 1.5 + hp * 0.15 + statSum + char.level * 5);
}

export function collectPlayers(db) {
    const list = [];
    if (!db?.users) return list;
    for (const [id, user] of Object.entries(db.users)) {
        const char = user?.rpg;
        if (!char?.class) continue;
        list.push({
            id,
            name: safeCharName(char, user, 'Player'),
            class: char.class,
            level: char.level || 1,
            aether: char.aether || 0,
            power: calcPower(char),
            lang: char.lang || 'id',
        });
    }
    return list;
}

export function rankBy(players, key, limit = 10) {
    return [...players]
        .sort((a, b) => {
            if (b[key] !== a[key]) return b[key] - a[key];
            return a.name.localeCompare(b.name);
        })
        .slice(0, limit);
}

export function buildLeaderboardText(db, type, lang = 'id') {
    const players = collectPlayers(db);
    if (!players.length) {
        return lang === 'en' ? '_No players yet_' : '_Belum ada player_';
    }

    const medals = ['🥇', '🥈', '🥉'];
    const limit = 10;

    function section(title, key, formatter) {
        const ranked = rankBy(players, key, limit);
        const lines = ranked.map((p, i) => {
            const medal = medals[i] || `*${i + 1}.*`;
            const cls = CLASSES[p.class];
            const emoji = cls?.emoji || '⚔️';
            return `${medal} ${emoji} *${p.name}* — ${formatter(p)}`;
        });
        return `*${title}*\n${lines.join('\n')}`;
    }

    if (type === 'aether') {
        return section(
            lang === 'en' ? '💰 Top Aether' : '💰 Top Aether',
            'aether',
            (p) => formatAether(p.aether),
        );
    }
    if (type === 'level') {
        return section(
            lang === 'en' ? '📊 Top Level' : '📊 Top Level',
            'level',
            (p) => `Lv ${p.level}`,
        );
    }
    if (type === 'power') {
        return section(
            lang === 'en' ? '⚡ Top Power' : '⚡ Top Power',
            'power',
            (p) => `${p.power} PWR`,
        );
    }

    return [
        lang === 'en' ? '🏆 *Leaderboard*' : '🏆 *Papan Peringkat*',
        `━━━━━━━━━━━━━━━━`,
        section(lang === 'en' ? '💰 Aether' : '💰 Aether', 'aether', (p) => formatAether(p.aether)),
        ``,
        section(lang === 'en' ? '📊 Level' : '📊 Level', 'level', (p) => `Lv ${p.level}`),
        ``,
        section(lang === 'en' ? '⚡ Power' : '⚡ Power', 'power', (p) => `${p.power} PWR`),
        `━━━━━━━━━━━━━━━━`,
        lang === 'en'
            ? `*.lb aether* · *.lb level* · *.lb power*`
            : `*.lb aether* · *.lb level* · *.lb power*`,
    ].join('\n');
}

export function findPlayerRank(db, primaryId) {
    const players = collectPlayers(db);
    const me = players.find((p) => p.id === primaryId);
    if (!me) return null;

    const byLevel = rankBy(players, 'level', players.length);
    const byAether = rankBy(players, 'aether', players.length);
    const byPower = rankBy(players, 'power', players.length);

    return {
        me,
        level: byLevel.findIndex((p) => p.id === primaryId) + 1,
        aether: byAether.findIndex((p) => p.id === primaryId) + 1,
        power: byPower.findIndex((p) => p.id === primaryId) + 1,
        total: players.length,
    };
}
