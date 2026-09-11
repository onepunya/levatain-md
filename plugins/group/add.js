import { getArgs } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:     ['add'],
        tag:     'group',
        aliasOnly: true,
        desc:    'Tambah member ke group lewat nomor WhatsApp',
        isGroup: true,
        isAdmin: true,
        ai: {
            trigger: 'User minta tambah/add member ke group pakai nomor telepon',
            examples: ['add 6281234567890'],
            args: { text: 'Nomor WhatsApp tujuan' },
        },
        async run(sock, { body, raw, from, isBotAdmin }) {
            if (!isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot harus jadi admin group dulu!' }, { quoted: raw });

            const num = getArgs(body).replace(/\D/g, '');
            if (!num) return sock.sendMessage(from, { text: '❌ Contoh: add 6281234567890' }, { quoted: raw });

            const target = `${num}@s.whatsapp.net`;
            try {
                const [res] = await sock.groupParticipantsUpdate(from, [target], 'add');
                if (res?.status === '403') {
                    const code = await sock.groupInviteCode(from);
                    return sock.sendMessage(from, {
                        text: `⚠️ Gak bisa add langsung (privasi user). Kirim link ini manual:\nhttps://chat.whatsapp.com/${code}`,
                    }, { quoted: raw });
                }
                await sock.sendMessage(from, { text: `✅ Berhasil invite @${num}`, mentions: [target] }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal add: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

