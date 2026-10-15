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
    .run(async (sock, { raw, from, primaryId, gdb }) => {
        const user = gdb.users[primaryId];
        if (!user) return;

        if (!user.registered) {
            return sock.sendMessage(from, {
                text: t('not_registered', 'id') + '\n\n' + t('not_registered', 'en'),
            }, { quoted: raw });
        }

        const char = getCharacter(user);
        if (!char) {
            return sock.sendMessage(from, {
                text: t('no_character', 'id'),
            }, { quoted: raw });
        }

        const lang = char.lang || 'id';
        const result = claimDaily(char);

        if (!result.ok) {
            return sock.sendMessage(from, {
                text: t('daily_already', lang, formatWait(result.waitMs)),
            }, { quoted: raw });
        }

        await persist();

        await sock.sendMessage(from, {
            text: t('daily_claimed', lang, formatAether(result.amount), formatAether(result.total)),
        }, { quoted: raw });
    });
