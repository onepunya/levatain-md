import { getArgs, msg } from '../../src/lib/index.js';
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
    .run(async (sock, { body, raw, from, isBotAdmin, db, primaryId }) => {
        if (!isBotAdmin) return sock.sendMessage(from, { text: msg('sys.bot_admin') }, { quoted: raw });

        const num = getArgs(body).replace(/\D/g, '');
        if (!num) return sock.sendMessage(from, { text: msg('need.number') }, { quoted: raw });

        const target = `${num}@s.whatsapp.net`;
        try {
            const [res] = await sock.groupParticipantsUpdate(from, [target], 'add');
            if (res?.status === '403') {
                const code = await sock.groupInviteCode(from);
                return sock.sendMessage(from, {
                    text: msg('group.add_privacy', { code }),
                }, { quoted: raw });
            }
            await sock.sendMessage(from, { text: `✅ Invited @${num}`, mentions: [target] }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.add', { msg: e.message }) }, { quoted: raw });
        }
    });

