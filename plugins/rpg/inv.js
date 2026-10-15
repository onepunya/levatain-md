import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    t,
    ensureInv,
    invCount,
    MAX_INVENTORY,
    buildInventoryText,
    buildEquipmentText,
} from '../../src/rpg/index.js';

export default plugin('inv', 'inventory', 'bag', 'tas')
    .in('rpg')
    .desc('View inventory and equipment')
    .prefixOnly()
    .signal('User wants to see inventory or bag', ['.inv', '.inventory', '.bag'])
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
        ensureInv(char);
        const used = invCount(char);

        const text = [
            t('inv_title', lang),
            `━━━━━━━━━━━━━━━━`,
            t('inv_slots', lang, used, MAX_INVENTORY),
            ``,
            `*Equipment*`,
            buildEquipmentText(char, lang),
            ``,
            `*Items*`,
            buildInventoryText(char, lang),
            `━━━━━━━━━━━━━━━━`,
            lang === 'en'
                ? `*.equip <id>*  ·  *.unequip <slot>*`
                : `*.equip <id>*  ·  *.unequip <slot>*`,
        ].join('\n');

        await sock.sendMessage(from, { text }, { quoted: raw });
    });
