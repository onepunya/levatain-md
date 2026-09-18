import { plugins } from '../../src/core/loader.js';
import { plugin } from '../../src/core/plugin.js';
import { msg } from '../../src/lib/messages.js';

export default plugin('setsticker', 'stikercmd')
    .in('owner')
    .desc('Register a sticker as a command trigger. Reply to a sticker + command name, or "remove" to unregister.')
    .prefixOnly()
    .ownerOnly()
    .signal('register a sticker as a bot command', ['.setsticker nightcore (reply sticker)', '.setsticker remove (reply sticker)'])
    .run(async (sock, { message, raw, from, gdb, saveDb, body, primaryId }) => {
        const quoted     = message.quoted;
        const stickerMsg = quoted?.raw?.message?.stickerMessage;

        if (!stickerMsg) {
            return sock.sendMessage(from, { text: msg('need.sticker_reply') }, { quoted: raw });
        }

        const arg = body.trim().split(/\s+/).slice(1).join(' ').toLowerCase();
        if (!arg) {
            return sock.sendMessage(from, { text: msg('need.command') }, { quoted: raw });
        }

        const hash = Buffer.from(stickerMsg.fileSha256 || []).toString('hex');
        if (!gdb.settings.stickerCmds) gdb.settings.stickerCmds = {};

        if (['hapus', 'del', 'remove'].includes(arg)) {
            delete gdb.settings.stickerCmds[hash];
            await saveDb();
            return sock.sendMessage(from, { text: msg('done.sticker_unset') }, { quoted: raw });
        }

        if (!plugins.has(arg)) {
            return sock.sendMessage(from, { text: msg('fail.cmd_missing', { arg }) }, { quoted: raw });
        }

        gdb.settings.stickerCmds[hash] = arg;
        await saveDb();
        return sock.sendMessage(from, { text: msg('done.sticker_set', { cmd: arg }) }, { quoted: raw });
    });

