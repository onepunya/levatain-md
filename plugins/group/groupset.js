import { getArgs } from '../../src/util/index.js';
import { msg, setSubject, setDescription, inviteLink, revokeInvite } from '../../src/wa/index.js';
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
    .botAdmin()
    .run(async (sock, {
        body,
        from,
        command,
        reply
    }) => {
        if (command === 'setgname') {
            const text = getArgs(body);
            if (!text) return reply(msg('need.gname'));
            await setSubject(sock, from, text);
            return reply(msg('done.group_name', { name: text }));
        }

        if (command === 'setgdesc') {
            const text = getArgs(body);
            if (!text) return reply(msg('need.gdesc'));
            await setDescription(sock, from, text);
            return reply(msg('done.group_desc'));
        }

        if (command === 'linkgroup') {
            return reply(`🔗 ${await inviteLink(sock, from)}`);
        }

        if (command === 'revoklink') {
            return reply(msg('done.link_reset', { code: await revokeInvite(sock, from) }));
        }
    });
