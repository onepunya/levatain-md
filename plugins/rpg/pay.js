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
            return reply(t('pay_need', lang));
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
            return reply(t('pay_need', lang));
        }

        const result = transferAether(char, targetChar, amount);
        if (!result.ok) {
            if (result.reason === 'NO_MONEY') {
                return reply(t('no_money', lang, formatAether(amount), formatAether(result.have)));
            }
            return reply(t('bad_amount', lang));
        }

        await persist();

        const targetName = displayName(gdb, found.id, 'Player');
        await reply(t('pay_ok', lang, formatAether(result.amount), targetName));
    });
