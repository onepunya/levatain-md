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
    .run(async (sock, { primaryId, gdb, body, reply }) => {
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
        const parts = (body || '').trim().split(/\s+/).slice(1);
        const itemId = (parts[0] || '').toLowerCase();
        const qty = parseInt(parts[1], 10) || 1;

        if (!itemId) {
            return reply(t('buy_need', lang));
        }

        const result = buyItem(char, itemId, qty);

        if (!result.ok) {
            const map = {
                INVALID: t('item_not_found', lang),
                NOT_FOR_SALE: t('not_for_sale', lang),
                NO_MONEY: t('no_money', lang, formatAether(result.need), formatAether(result.have)),
                FULL: t('inv_full', lang),
            };
            return reply(map[result.reason] || `❌ ${result.reason}`);
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        await reply(t('buy_ok', lang, name, result.qty, formatAether(result.price), formatAether(result.balance)));
    });
