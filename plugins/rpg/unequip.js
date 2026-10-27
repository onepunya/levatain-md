import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    unequipSlot,
    getItem,
    SLOTS,
} from '../../src/rpg/index.js';

export default plugin('unequip', 'lepas', 'unwear')
    .in('rpg')
    .desc('Unequip item from a slot')
    .prefixOnly()
    .cooldown(2)
    .signal('User wants to unequip an item', ['.unequip weapon', '.lepas armor'])
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
        const slot = (parts[0] || '').toLowerCase();

        if (!slot || !SLOTS.includes(slot)) {
            return reply(t('unequip_need_slot', lang));
        }

        const result = unequipSlot(char, slot);

        if (!result.ok) {
            const map = {
                EMPTY: t('slot_empty', lang),
                FULL: t('inv_full', lang),
                BAD_SLOT: t('unequip_need_slot', lang),
            };
            return reply(map[result.reason] || `❌ ${result.reason}`);
        }

        await persist();

        const item = getItem(result.itemId);
        const name = item ? (item.name[lang] || item.name.en) : result.itemId;
        await reply(t('unequip_ok', lang, name, result.slot));
    });
