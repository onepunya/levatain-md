import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';
export default plugin('delete', 'del')
    .in('group')
    .desc('Delete the replied message (admin only)')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .signal('User asks to delete a specific message in a group, usually by replying to it', ['del', 'delete', 'hapus pesan ini'])
    .run(async (sock, { message, raw, from, isBotAdmin, db, primaryId }) => {
        if (!isBotAdmin) return sock.sendMessage(from, { text: msg('sys.bot_admin') }, { quoted: raw });
        if (!message.quoted) return sock.sendMessage(from, { text: msg('need.reply_delete') }, { quoted: raw });

        try {
            await sock.sendMessage(from, {
                delete: {
                    remoteJid: from,
                    fromMe:    Boolean(message.quoted.fromMe),
                    id:        message.quoted.stanzaId,
                    participant: message.quoted.sender,
                },
            });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.delete', { msg: e.message }) }, { quoted: raw });
        }
    });

