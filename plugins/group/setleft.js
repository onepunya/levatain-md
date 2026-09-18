import { getArgs, msg } from '../../src/lib/index.js';
import { saveDb } from '../../src/core/db.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('setleft')
    .in('group')
    .desc('Set custom leave message when a member leaves (@user & @group)')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .ai({
        trigger: 'User asks to set leave/goodbye message when a member leaves the group',
        examples: ['setleft goodbye @user from @group', 'setleft off'],
        args: { text: 'Message text, can use @user and @group' },
    })
    .run(async (sock, { body, raw, from, gdb, primaryId }) => {
        const text = getArgs(body);
        const grp  = gdb.groups[from];

        if (!text) {
            return sock.sendMessage(from, {
                text: msg('need.text'),
            }, { quoted: raw });
        }

        if (text.toLowerCase() === 'off') {
            grp.leftText = '';
            await saveDb();
            return sock.sendMessage(from, { text: msg('done.left_reset') }, { quoted: raw });
        }

        grp.leftText = text;
        await saveDb();
        await sock.sendMessage(from, { text: `✅ Leave message set:\n\n${text}` }, { quoted: raw });
    });

