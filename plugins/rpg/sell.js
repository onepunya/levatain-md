import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    sellItem,
    formatAether,
} from '../../src/rpg/index.js';

export default plugin('sell', 'jual')
    .in('rpg')
    .desc('Sell item from inventory')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to sell item', ['.sell wooden_sword', '.jual copper_ring 2'])
    .run(async (sock, { raw, from, primaryId, gdb, body }) => {
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
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const itemId = (parts[0] || '').toLowerCase();
        const qty = parseInt(parts[1], 10) || 1;

        if (!itemId) {
            return sock.sendMessage(from, {
                text: t('sell_need', lang),
            }, { quoted: raw });
        }

        const result = sellItem(char, itemId, qty);

        if (!result.ok) {
            const map = {
                INVALID: t('item_not_found', lang),
                NOT_FOUND: t('item_not_found', lang),
            };
            return sock.sendMessage(from, {
                text: map[result.reason] || `❌ ${result.reason}`,
            }, { quoted: raw });
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        await sock.sendMessage(from, {
            text: t('sell_ok', lang, name, result.qty, formatAether(result.gain), formatAether(result.balance)),
        }, { quoted: raw });
    });
