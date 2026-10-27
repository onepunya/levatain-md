import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    t,
    buildLeaderboardText,
    findPlayerRank,
    formatAether,
} from '../../src/rpg/index.js';

export default plugin('leaderboard', 'lb', 'rank', 'ranking', 'top')
    .in('rpg')
    .desc('RPG leaderboard — aether, level, power')
    .prefixOnly()
    .cooldown(3)
    .signal('User wants RPG leaderboard or ranking', [
        '.leaderboard',
        '.lb',
        '.lb aether',
        '.rank power',
    ])
    .run(async (sock, { primaryId, gdb, body, reply }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return reply(t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'));
        }

        const char = getCharacter(user);
        const lang = char?.lang || 'id';

        const parts = (body || '').trim().split(/\s+/).slice(1);
        const typeRaw = (parts[0] || '').toLowerCase();
        let type = 'all';
        if (['aether', 'ae', 'money', 'uang'].includes(typeRaw)) type = 'aether';
        else if (['level', 'lv', 'lvl'].includes(typeRaw)) type = 'level';
        else if (['power', 'pwr', 'str', 'kekuatan'].includes(typeRaw)) type = 'power';

        let text = buildLeaderboardText(gdb, type, lang);

        const myRank = findPlayerRank(gdb, primaryId);
        if (myRank) {
            text += `\n\n📍 *You / Kamu*\n`;
            text += `Lv ${myRank.me.level} · ${formatAether(myRank.me.aether)} · ${myRank.me.power} PWR\n`;
            text += `#${myRank.level} Level · #${myRank.aether} Aether · #${myRank.power} Power`;
        }

        await reply(text);
    });
