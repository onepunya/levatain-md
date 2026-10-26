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

        if (!itemId) {
            return sock.sendMessage(from, {
                text: t('equip_need_id', lang),
            }, { quoted: raw });
        }

        const result = equipItem(char, itemId);

        if (!result.ok) {
            const map = {
                NOT_FOUND: t('item_not_found', lang),
                NOT_EQUIPMENT: t('not_equipment', lang),
                LEVEL: t('level_too_low', lang, result.req),
                FULL: t('inv_full', lang),
            };
            return sock.sendMessage(from, {
                text: map[result.reason] || `❌ ${result.reason}`,
            }, { quoted: raw });
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        await sock.sendMessage(from, {
            text: t('equip_ok', lang, name, result.slot),
        }, { quoted: raw });
    });
