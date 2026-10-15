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
        const text = [
            t('shop_title', lang),
            `━━━━━━━━━━━━━━━━`,
            lang === 'en' ? `Your Aether: *${formatAether(char.aether)}*` : `Aether kamu: *${formatAether(char.aether)}*`,
            ``,
            buildShopText(lang),
            `━━━━━━━━━━━━━━━━`,
            t('shop_footer', lang),
        ].join('\n');

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
