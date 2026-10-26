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
    .run(async (sock, { raw, from, primaryId, gdb, body, message, mentionedJid }) => {
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
        const targetId = resolveTargetId({ message, mentionedJid, primaryId, body });
        if (!targetId) {
            return sock.sendMessage(from, {
                text: t('give_need', lang),
            }, { quoted: raw });
        }

        const found = findUserInDb(gdb, targetId);
        if (!found) {
            return sock.sendMessage(from, {
                text: t('no_target', lang),
            }, { quoted: raw });
        }

        if (found.id === primaryId) {
            return sock.sendMessage(from, {
                text: t('self_trade', lang),
            }, { quoted: raw });
        }

        const targetChar = getCharacter(found.user);
        if (!targetChar) {
            return sock.sendMessage(from, {
                text: t('target_no_rpg', lang),
            }, { quoted: raw });
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
            return sock.sendMessage(from, {
                text: t('give_need', lang),
            }, { quoted: raw });
        }

        const result = transferItem(char, targetChar, itemId, qty);
        if (!result.ok) {
            const map = {
                NOT_FOUND: t('item_not_found', lang),
                INVALID: t('item_not_found', lang),
                TARGET_FULL: t('target_full', lang),
            };
            return sock.sendMessage(from, {
                text: map[result.reason] || `❌ ${result.reason}`,
            }, { quoted: raw });
        }

        await persist();

        const name = result.item.name[lang] || result.item.name.en;
        const targetName = displayName(gdb, found.id, 'Player');
        await sock.sendMessage(from, {
            text: t('give_ok', lang, name, result.qty, targetName),
        }, { quoted: raw });
    });
