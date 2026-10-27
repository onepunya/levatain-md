import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    t,
    buildShopText,
    formatAether,
} from '../../src/rpg/index.js';

export default plugin('shop', 'toko', 'store')
    .in('rpg')
    .desc('Open Aether shop catalog')
    .prefixOnly()
    .signal('User wants to open shop or store', ['.shop', '.toko'])
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
        const text = [
            t('shop_title', lang),
            `━━━━━━━━━━━━━━━━`,
            lang === 'en' ? `Your Aether: *${formatAether(char.aether)}*` : `Aether kamu: *${formatAether(char.aether)}*`,
            ``,
            buildShopText(lang),
            `━━━━━━━━━━━━━━━━`,
            t('shop_footer', lang),
        ].join('\n');

        await reply(text);
    });
