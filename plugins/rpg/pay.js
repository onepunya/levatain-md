import { plugin } from '../../src/core/plugin.js';
import {
    getCharacter,
    persist,
    t,
    transferAether,
    formatAether,
    resolveTargetId,
    findUserInDb,
    displayName,
} from '../../src/rpg/index.js';

export default plugin('pay', 'transfer', 'kirim')
    .in('rpg')
    .desc('Transfer Aether to another player')
    .prefixOnly()
    .cooldown(3)
    .signal('User wants to pay or transfer Aether', ['.pay @user 100', '.transfer 50'])
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
                text: t('pay_need', lang),
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
        let amount = null;
        for (const p of parts) {
            if (p.startsWith('@')) continue;
            const n = parseInt(p.replace(/\D/g, ''), 10);
            if (Number.isFinite(n) && n > 0) {
                amount = n;
                break;
            }
        }

        if (!amount) {
            return sock.sendMessage(from, {
                text: t('pay_need', lang),
            }, { quoted: raw });
        }

        const result = transferAether(char, targetChar, amount);
        if (!result.ok) {
            if (result.reason === 'NO_MONEY') {
                return sock.sendMessage(from, {
                    text: t('no_money', lang, formatAether(amount), formatAether(result.have)),
                }, { quoted: raw });
            }
            return sock.sendMessage(from, {
                text: t('bad_amount', lang),
            }, { quoted: raw });
        }

        await persist();

        const targetName = displayName(gdb, found.id, 'Player');
        await sock.sendMessage(from, {
            text: t('pay_ok', lang, formatAether(result.amount), targetName),
        }, { quoted: raw });
    });
