import { getArgs } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:     ['setgname', 'setgdesc', 'linkgroup', 'revoklink'],
        tag:     'group',
        aliasOnly: false,
        desc:    'Ubah nama/deskripsi group, ambil atau revoke link invite',
        isGroup: true,
        isAdmin: true,
        ai: {
            trigger: 'User minta ubah nama group, ubah deskripsi group, minta link invite group, atau reset link group',
            examples: ['setgname Nama Baru', 'setgdesc Deskripsi baru', 'linkgroup', 'revoklink'],
            args: { text: 'Teks nama/deskripsi baru (untuk setgname/setgdesc)' },
        },
        async run(sock, { body, raw, from, command, isBotAdmin }) {
            if (!isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot harus jadi admin group dulu!' }, { quoted: raw });

            if (command === 'setgname') {
                const text = getArgs(body);
                if (!text) return sock.sendMessage(from, { text: '❌ Contoh: setgname Nama Group Baru' }, { quoted: raw });
                await sock.groupUpdateSubject(from, text);
                return sock.sendMessage(from, { text: `✅ Nama group diubah jadi: *${text}*` }, { quoted: raw });
            }

            if (command === 'setgdesc') {
                const text = getArgs(body);
                if (!text) return sock.sendMessage(from, { text: '❌ Contoh: setgdesc Deskripsi baru group' }, { quoted: raw });
                await sock.groupUpdateDescription(from, text);
                return sock.sendMessage(from, { text: '✅ Deskripsi group diubah.' }, { quoted: raw });
            }

            if (command === 'linkgroup') {
                const code = await sock.groupInviteCode(from);
                return sock.sendMessage(from, { text: `🔗 https://chat.whatsapp.com/${code}` }, { quoted: raw });
            }

            if (command === 'revoklink') {
                const code = await sock.groupRevokeInvite(from);
                return sock.sendMessage(from, { text: `♻️ Link lama direset.\n🔗 https://chat.whatsapp.com/${code}` }, { quoted: raw });
            }
        },
    },
};

