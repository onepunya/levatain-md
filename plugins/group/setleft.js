import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { saveDb } from '../../src/storage/db.js';
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
    .run(async (sock, {
        body,
        from,
        gdb,
        reply
    }) => {
        const text = getArgs(body);
        const grp = gdb.groups[from];

        if (!text) {
            return reply(msg('need.text'));
        }

        if (text.toLowerCase() === 'off') {
            grp.leftText = '';
            await saveDb();
            return reply(msg('done.left_reset'));
        }

        grp.leftText = text;
        await saveDb();
        await reply(`✅ Leave message set:\n\n${text}`);
    });
