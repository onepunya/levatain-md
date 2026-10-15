import { plugin } from '../../src/core/plugin.js';
import { getCharacter, formatAether, t, ensureBank } from '../../src/rpg/index.js';

export default plugin('balance', 'bal', 'aether', 'saldo')
    .in('rpg')
    .desc('Check Aether balance')
    .prefixOnly()
    .signal('User wants to check Aether balance or money', ['.balance', '.bal', '.aether'])
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
        ensureBank(char);
        await sock.sendMessage(from, {
            text: t('bank_status', lang, formatAether(char.aether), formatAether(char.bank || 0)),
        }, { quoted: raw });
    });
