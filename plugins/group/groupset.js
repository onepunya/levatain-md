import { getArgs, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('setgname', 'setgdesc', 'linkgroup', 'revoklink')
    .in('group')
    .desc('Change group name/description, get or revoke invite link')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .ai({
        trigger: 'User asks to change group name, description, get invite link, or reset the group link',
        examples: ['setgname Nama Baru', 'setgdesc Deskripsi baru', 'linkgroup', 'revoklink'],
        args: { text: 'New name/description text (for setgname/setgdesc)' },
    })
    .run(async (sock, { body, raw, from, command, isBotAdmin, db, primaryId }) => {
        if (!isBotAdmin) return sock.sendMessage(from, { text: msg('sys.bot_admin') }, { quoted: raw });

        if (command === 'setgname') {
            const text = getArgs(body);
            if (!text) return sock.sendMessage(from, { text: msg('need.gname') }, { quoted: raw });
            await sock.groupUpdateSubject(from, text);
            return sock.sendMessage(from, { text: msg('done.group_name', { name: text }) }, { quoted: raw });
        }

        if (command === 'setgdesc') {
            const text = getArgs(body);
            if (!text) return sock.sendMessage(from, { text: msg('need.gdesc') }, { quoted: raw });
            await sock.groupUpdateDescription(from, text);
            return sock.sendMessage(from, { text: msg('done.group_desc') }, { quoted: raw });
        }

        if (command === 'linkgroup') {
            const code = await sock.groupInviteCode(from);
            return sock.sendMessage(from, { text: `🔗 https://chat.whatsapp.com/${code}` }, { quoted: raw });
        }

        if (command === 'revoklink') {
            const code = await sock.groupRevokeInvite(from);
            return sock.sendMessage(from, { text: msg('done.link_reset', { code }) }, { quoted: raw });
        }
    });

