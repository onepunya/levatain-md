import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    equipItem,
} from '../../src/rpg/index.js';

export default plugin('equip', 'pakai', 'wear')
    .in('rpg')
    .desc('Equip an item from inventory')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to equip an item', ['.equip wooden_sword', '.pakai iron_sword'])
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

        if (!itemId) {
            return reply(t('equip_need_id', lang));
        }

        const result = equipItem(char, itemId);

        if (!result.ok) {
            const map = {
                NOT_FOUND: t('item_not_found', lang),
                NOT_EQUIPMENT: t('not_equipment', lang),
                LEVEL: t('level_too_low', lang, result.req),
                FULL: t('inv_full', lang),
            };
            return reply(map[result.reason] || `❌ ${result.reason}`);
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        await reply(t('equip_ok', lang, name, result.slot));
    });
