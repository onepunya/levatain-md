import { getArgs } from '../../src/lib/utils.js';
import { saveDb } from '../../src/core/db.js';

export const meta = {
    interface: {
        cmd:     ['setleft'],
        tag:     'group',
        aliasOnly: true,
        desc:    'Atur pesan custom saat member keluar group (pakai @user & @group)',
        isGroup: true,
        isAdmin: true,
        ai: {
            trigger: 'User minta atur pesan perpisahan/pesan left saat member keluar group',
            examples: ['setleft selamat tinggal @user dari @group', 'setleft off'],
            args: { teks: 'Teks pesan, boleh pakai @user dan @group' },
        },
        async run(sock, { body, raw, from, gdb }) {
            const text = getArgs(body);
            const grp  = gdb.groups[from];

            if (!text) {
                return sock.sendMessage(from, {
                    text: `Gunakan: *.setleft <teks>*\nContoh: *.setleft Selamat tinggal @user dari @group*\n\nTag tersedia:\n• @user — member yang keluar\n• @group — nama group\n\nKetik *.setleft off* untuk pakai pesan default lagi.`,
                }, { quoted: raw });
            }

            if (text.toLowerCase() === 'off') {
                grp.leftText = '';
                await saveDb();
                return sock.sendMessage(from, { text: '✅ Pesan left dikembalikan ke default.' }, { quoted: raw });
            }

            grp.leftText = text;
            await saveDb();
            await sock.sendMessage(from, { text: `✅ Pesan left berhasil diatur:\n\n${text}` }, { quoted: raw });
        },
    },
};

