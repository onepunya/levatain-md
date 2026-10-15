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
        const slot = (parts[0] || '').toLowerCase();

        if (!slot || !SLOTS.includes(slot)) {
            return sock.sendMessage(from, {
                text: t('unequip_need_slot', lang),
            }, { quoted: raw });
        }

        const result = unequipSlot(char, slot);

        if (!result.ok) {
            const map = {
                EMPTY: t('slot_empty', lang),
                FULL: t('inv_full', lang),
                BAD_SLOT: t('unequip_need_slot', lang),
            };
            return sock.sendMessage(from, {
                text: map[result.reason] || `❌ ${result.reason}`,
            }, { quoted: raw });
        }

        await persist();

        const item = getItem(result.itemId);
        const name = item ? (item.name[lang] || item.name.en) : result.itemId;
        await sock.sendMessage(from, {
            text: t('unequip_ok', lang, name, result.slot),
        }, { quoted: raw });
    });
