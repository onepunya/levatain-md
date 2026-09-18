import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';
export default plugin('clearchat', 'cleargc')
    .in('group')
    .desc('Clear group chat history (admin view)')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .signal('User asks to clear/delete group chat history', ['clearchat', 'bersihkan chat group ini'])
    .run(async (sock, { raw, from, db, primaryId }) => {
        try {
            await sock.chatModify({
                clear: { messages: [{ id: raw.key.id, fromMe: Boolean(raw.key.fromMe), timestamp: raw.messageTimestamp }] },
            }, from);
            await sock.sendMessage(from, { text: '🧹 Group chat history cleared (bot side).' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.clearchat', { msg: e.message }) }, { quoted: raw });
        }
    });

