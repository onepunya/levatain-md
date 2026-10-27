import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    transferItem,
    resolveTargetId,
    findUserInDb,
} from '../../src/rpg/index.js';

export default plugin('give', 'kasih', 'beri')
    .in('rpg')
    .desc('Give item to another player')
    .prefixOnly()
    .cooldown(3)
    .signal('User wants to give item to another player', ['.give @user wooden_sword', '.kasih iron_sword'])
    .run(async (sock, { primaryId, gdb, body, message, mentionedJid, reply }) => {
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
        const targetId = resolveTargetId({ message, mentionedJid, primaryId, body });
        if (!targetId) {
            return reply(t('give_need', lang));
        }

        const found = findUserInDb(gdb, targetId);
        if (!found) {
            return reply(t('no_target', lang));
        }

        if (found.id === primaryId) {
            return reply(t('self_trade', lang));
        }

        const targetChar = getCharacter(found.user);
        if (!targetChar) {
            return reply(t('target_no_rpg', lang));
        }

        const parts = (body || '').trim().split(/\s+/).slice(1);
        let itemId = null;
        let qty = 1;
        for (const p of parts) {
            if (p.startsWith('@')) continue;
            if (/^\d+$/.test(p) && itemId) {
                qty = parseInt(p, 10) || 1;
                continue;
            }
            const cleaned = p.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (cleaned && /[a-z]/.test(cleaned)) {
                itemId = cleaned;
            }
        }

        if (!itemId) {
            return reply(t('give_need', lang));
        }

        const result = transferItem(char, targetChar, itemId, qty);
        if (!result.ok) {
            const map = {
                NOT_FOUND: t('item_not_found', lang),
                INVALID: t('item_not_found', lang),
                TARGET_FULL: t('target_full', lang),
            };
            return reply(map[result.reason] || `❌ ${result.reason}`);
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        const targetName = displayName(gdb, found.id, 'Player');
        await reply(t('give_ok', lang, name, result.qty, targetName));
    });
