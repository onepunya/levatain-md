import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';
export default plugin('kick', 'promote', 'demote')
    .in('group')
    .desc('Group member management (kick/promote/demote)')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .signal('User asks to kick, promote, or demote a group member', ['kick @user', 'promote @admin', 'remove this user'])
    .run(async (sock, { message, raw, from, command, mentionedJid, participants, isBotAdmin, db, primaryId }) => {
        if (!isBotAdmin) return sock.sendMessage(from, { text: msg('sys.bot_admin') }, { quoted: raw });

        let target;
        if (message.quoted) {
            const s   = message.quoted.sender.replace(/@.*/, '').split(':')[0];
            target    = message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
        } else if (mentionedJid?.[0]) {
            target    = mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
        }

        if (!target) return sock.sendMessage(from, { text: msg('need.tag') }, { quoted: raw });

        const targetNum = target.replace(/\D/g, '');
        const found     = participants.find(p =>
            (p.id          && p.id.replace(/\D/g, '') === targetNum) ||
            (p.lid         && p.lid.replace(/\D/g, '') === targetNum) ||
            (p.phoneNumber && p.phoneNumber.replace(/\D/g, '') === targetNum)
        );
        if (!found) return sock.sendMessage(from, { text: msg('fail.user_not_in_group') }, { quoted: raw });

        const targetId  = found.id;
        const targetTag = `@${targetId.split('@')[0]}`;

        const actions = {
            kick:    ['remove',  `✅ ${targetTag} removed.`],
            promote: ['promote', `✅ ${targetTag} promoted to admin.`],
            demote:  ['demote',  `✅ ${targetTag} demoted from admin.`],
        };

        const [action, reply] = actions[command] || [];
        if (!action) return;

        await sock.groupParticipantsUpdate(from, [targetId], action);
        await sock.sendMessage(from, { text: reply, mentions: [targetId] }, { quoted: raw });
    });

