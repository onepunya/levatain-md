export const meta = {
    interface: {
        cmd:  ['groupinfo', 'ginfo'],
        tag:  'group',
        aliasOnly: true,
        desc: 'Lihat info group (nama, deskripsi, member, admin)',
        isGroup: true,
        ai: {
            trigger: 'User minta info group, detail group, atau data group ini',
            examples: ['info group', 'ginfo'],
        },
        async run(sock, { raw, from, groupMetadata, admins, participants }) {
            if (!groupMetadata) return sock.sendMessage(from, { text: '❌ Gagal ambil data group.' }, { quoted: raw });

            const created = groupMetadata.creation
                ? new Date(groupMetadata.creation * 1000).toLocaleDateString('id-ID')
                : '-';

            const adminList = admins.map(id => `• @${id.split('@')[0]}`).join('\n') || '-';

            const ephemeral = groupMetadata.ephemeralDuration
                ? `${Math.round(groupMetadata.ephemeralDuration / 3600)} jam`
                : 'Nonaktif';

            const text = `*📋 INFO GROUP*\n\n`
                + `*Nama:* ${groupMetadata.subject}\n`
                + `*ID:* ${from}\n`
                + `*Dibuat:* ${created}\n`
                + `*Member:* ${participants.length}\n`
                + `*Kirim Pesan:* ${groupMetadata.announce ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
                + `*Edit Info Group:* ${groupMetadata.restrict ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
                + `*Tambah Member:* ${groupMetadata.memberAddMode === false ? '🔒 Hanya Admin' : '🔓 Semua Member'}\n`
                + `*Pesan Sekali Lihat:* ${ephemeral}\n`
                + (groupMetadata.isCommunity ? `*Community:* ✅ Ya\n` : '')
                + `*Deskripsi:*\n${groupMetadata.desc || '-'}\n\n`
                + `*Admin (${admins.length}):*\n${adminList}`;

            await sock.sendMessage(from, { text, mentions: admins }, { quoted: raw });
        },
    },
};

