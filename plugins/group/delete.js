export const meta = {
    cmd:     ['delete', 'del'],
    tag:     'group',
    aliasOnly: true,
    desc:    'Hapus pesan yang di-reply (admin only)',
    isGroup: true,
    isAdmin: true,
    ai: {
        trigger: 'User minta hapus pesan tertentu di group, biasanya sambil reply pesan itu',
        examples: ['del', 'delete', 'hapus pesan ini'],
    },
};

export async function run(sock, { message, raw, from, isBotAdmin }) {
    if (!isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot harus jadi admin group dulu!' }, { quoted: raw });
    if (!message.quoted) return sock.sendMessage(from, { text: '❌ Reply pesan yang mau dihapus dengan command ini.' }, { quoted: raw });

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
        await sock.sendMessage(from, { text: `❌ Gagal hapus pesan: ${e.message}` }, { quoted: raw });
    }
}
