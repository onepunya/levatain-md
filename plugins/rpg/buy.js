import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    buyItem,
    formatAether,
} from '../../src/rpg/index.js';

export default plugin('buy', 'beli')
    .in('rpg')
    .desc('Buy item from shop')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to buy item from shop', ['.buy wooden_sword', '.beli iron_sword 2'])
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
                text: t('buy_need', lang),
            }, { quoted: raw });
        }

        const result = buyItem(char, itemId, qty);

        if (!result.ok) {
            const map = {
                INVALID: t('item_not_found', lang),
                NOT_FOR_SALE: t('not_for_sale', lang),
                NO_MONEY: t('no_money', lang, formatAether(result.need), formatAether(result.have)),
                FULL: t('inv_full', lang),
            };
            return sock.sendMessage(from, {
                text: map[result.reason] || `❌ ${result.reason}`,
            }, { quoted: raw });
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        await sock.sendMessage(from, {
            text: t('buy_ok', lang, name, result.qty, formatAether(result.price), formatAether(result.balance)),
        }, { quoted: raw });
    });
