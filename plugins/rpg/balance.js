import { plugin } from '../../src/core/plugin.js';
import { getCharacter, formatAether, t, ensureBank } from '../../src/rpg/index.js';

export default plugin('balance', 'bal', 'aether', 'saldo')
    .in('rpg')
    .desc('Check Aether balance')
    .prefixOnly()
    .signal('User wants to check Aether balance or money', ['.balance', '.bal', '.aether'])
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
        ensureBank(char);
        await reply(t('bank_status', lang, formatAether(char.aether), formatAether(char.bank || 0)));
    });
