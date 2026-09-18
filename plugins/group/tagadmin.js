import { getArgs, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tagadmin')
    .in('group')
    .desc('Tag all admins group')
    .prefixOnly()
    .groupOnly()
    .cooldown(10)
    .ai({
        trigger: 'User asks to tag/call all group admins',
        examples: ['tagadmin please check', 'call all admins'],
        args: { text: 'Message to send' },
    })
    .run(async (sock, { body, raw, from, admins, db, primaryId }) => {
        if (!admins?.length) return sock.sendMessage(from, { text: msg('fail.no_admins') }, { quoted: raw });

        const text = getArgs(body) || '📢 Calling all admins!';
        const list = admins.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n');

        await sock.sendMessage(from, {
            text: `${text}\n\n${list}`,
            mentions: admins,
        }, { quoted: raw });
    });

