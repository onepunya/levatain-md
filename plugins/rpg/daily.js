import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    claimDaily,
    formatWait,
    formatAether,
    persist,
    t,
} from '../../src/rpg/index.js';

export default plugin('daily', 'klaim', 'hadiah')
    .in('rpg')
    .desc('Claim daily Aether reward')
    .prefixOnly()
    .cooldown(3)
    .signal('User wants to claim daily reward or daily Aether', ['.daily', '.klaim'])
    .run(async (sock, { primaryId, gdb, reply }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return reply(t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'));
        }

        const char = getCharacter(user);
        if (!char) {
            return reply(t('no_character', 'id'));
        }

        const lang = char.lang || 'id';
        const result = claimDaily(char);

        if (!result.ok) {
            return reply(t('daily_already', lang, formatWait(result.waitMs)));
        }

        await persist();

        await reply(t('daily_claimed', lang, formatAether(result.amount), formatAether(result.total)));
    });
