import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/wa/messages.js';
export default plugin('clearchat', 'cleargc')
    .in('group')
    .desc('Clear group chat history (admin view)')
    .prefixOnly()
    .adminOnly()
    .groupOnly()
    .signal('User asks to clear/delete group chat history', ['clearchat', 'bersihkan chat group ini'])
    .run(async (sock, { raw, from, reply }) => {
        try {
            await sock.chatModify({
                clear: { messages: [{ id: raw.key.id, fromMe: Boolean(raw.key.fromMe), timestamp: raw.messageTimestamp }] },
            }, from);
            await reply('🧹 Group chat history cleared (bot side).');
        } catch (e) {
            await reply(msg('fail.clearchat', { msg: e.message }));
        }
    });
