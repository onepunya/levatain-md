export const meta = {
    cmd:     ['clearchat', 'cleargc'],
    tag:     'group',
    aliasOnly: true,
    desc:    'Bersihkan riwayat chat group (khusus tampilan admin)',
    isGroup: true,
    isAdmin: true,
    ai: {
        trigger: 'User minta bersihkan/hapus riwayat obrolan group',
        examples: ['clearchat', 'bersihkan chat group ini'],
    },
};

export async function run(sock, { raw, from }) {
    try {
        await sock.chatModify({
            clear: { messages: [{ id: raw.key.id, fromMe: Boolean(raw.key.fromMe), timestamp: raw.messageTimestamp }] },
        }, from);
        await sock.sendMessage(from, { text: '🧹 Riwayat chat group berhasil dibersihkan (di sisi bot).' }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal membersihkan chat: ${e.message}` }, { quoted: raw });
    }
}
