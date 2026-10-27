import { getArgs } from '../../src/util/index.js';
import { msg, addMember, inviteCode } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('add')
    .in('group')
    .desc('Add a member to the group via WhatsApp number')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .ai({
        trigger: 'User asks to add a member to the group using a phone number',
        examples: ['add 6281234567890'],
        args: { text: 'Target WhatsApp number' },
    })
    .botAdmin()
    .run(async (sock, { body, from, reply }) => {
        const num = getArgs(body).replace(/\D/g, '');
        if (!num) return reply(msg('need.number'));

        const target = `${num}@s.whatsapp.net`;
        try {
            const res = await addMember(sock, from, target);
            if (res?.status === '403') {
                return reply(msg('group.add_privacy', { code: await inviteCode(sock, from) }));
            }
            await reply(`✅ Invited @${num}`, { mentions: [target] });
        } catch (e) {
            await reply(msg('fail.add', { msg: e.message }));
        }
    });
