import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/wa/messages.js';
export default plugin('delete', 'del')
    .in('group')
    .desc('Delete the replied message (admin only)')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .signal('User asks to delete a specific message in a group, usually by replying to it', ['del', 'delete', 'hapus pesan ini'])
    .botAdmin()
    .run(async (sock, {
        message,
        from,
        reply,
        send
    }) => {
        if (!message.quoted) return reply(msg('need.reply_delete'));

        try {
            await send({
                delete: {
                    remoteJid: from,
                    fromMe: Boolean(message.quoted.fromMe),
                    id: message.quoted.stanzaId,
                    participant: message.quoted.sender,
                },
            });
        } catch (e) {
            await reply(msg('fail.delete', { msg: e.message }));
        }
    });
