import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { saveDb } from '../../src/storage/db.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('afk')
    .in('group')
    .desc('Set AFK status; bot notifies when you are tagged/replied')
    .prefixOnly()
    .ai({
        trigger: 'User wants to set AFK status or is unavailable',
        examples: ['afk lagi makan', 'afk', 'afk sholat dulu'],
        args: { reason: 'AFK reason (optional)' },
    })
    .run(async (sock, {
        body,
        from,
        primaryId,
        gdb,
        isGroup,
        reply
    }) => {
        if (!isGroup) return reply(msg('sys.group_only_short'));

        const reason = getArgs(body) || '';
        const grp = gdb.groups[from];
        grp.afk[primaryId] = { since: Date.now(), reason };
        await saveDb();

        const tag = primaryId.split('@')[0];
        await reply({
            text: `┌───「 *AFK STATUS ON* 」\n├ *User:* @${tag}\n├ *Reason:* ${reason || 'None'}\n└ _The bot will notify if someone mentions you._`,
            mentions: [primaryId],
        });
    });
