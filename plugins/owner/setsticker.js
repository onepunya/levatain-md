import { plugins } from '../../src/core/loader.js';

export const meta = {
    interface: {
        cmd:     ['setsticker', 'stikercmd'],
        tag:     'owner',
        aliasOnly: true,
        desc:    'Daftarin stiker khusus jadi trigger command. Reply stiker + nama command, atau "hapus" buat cabut',
        isOwner: true,
        ai: {
            trigger:  'daftarin stiker jadi command bot',
            examples: ['.setsticker nightcore (reply stiker)', '.setsticker hapus (reply stiker)'],
        },
        async run(sock, { message, raw, from, gdb, saveDb, body }) {
            const quoted     = message.quoted;
            const stickerMsg = quoted?.raw?.message?.stickerMessage;

            if (!stickerMsg) {
                return sock.sendMessage(from, { text: '❌ Reply stiker yang mau didaftarin, contoh:\n.setsticker nightcore' }, { quoted: raw });
            }

            const arg = body.trim().split(/\s+/).slice(1).join(' ').toLowerCase();
            if (!arg) {
                return sock.sendMessage(from, { text: '❌ Kasih nama command-nya, contoh:\n.setsticker nightcore' }, { quoted: raw });
            }

            const hash = Buffer.from(stickerMsg.fileSha256 || []).toString('hex');
            if (!gdb.settings.stickerCmds) gdb.settings.stickerCmds = {};

            if (['hapus', 'del', 'remove'].includes(arg)) {
                delete gdb.settings.stickerCmds[hash];
                await saveDb();
                return sock.sendMessage(from, { text: '🗑️ Stiker ini dicabut dari daftar trigger.' }, { quoted: raw });
            }

            if (!plugins.has(arg)) {
                return sock.sendMessage(from, { text: `❌ Command "${arg}" gak ketemu, cek dulu di .menu.` }, { quoted: raw });
            }

            gdb.settings.stickerCmds[hash] = arg;
            await saveDb();
            return sock.sendMessage(from, { text: `✅ Stiker ini sekarang jadi trigger buat *.${arg}*\nKirim stiker ini lagi kapan aja buat langsung jalanin command-nya.` }, { quoted: raw });
        },
    },
};

