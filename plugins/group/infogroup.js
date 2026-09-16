import { sendInlineWebUI } from '../../src/lib/rich-messages.js';
import { renderInfoCard, htmlEscape } from '../../src/lib/webui-templates.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('infogroup', 'ginfo')
    .in('group')
    .desc('Lihat info group')
    .prefixOnly()
    .groupOnly()
    .signal('User minta info group', ['infogroup', 'ginfo', 'info group'])
    .run(async (sock, { raw, from, groupMetadata, admins, participants }) => {
        if (!groupMetadata) return sock.sendMessage(from, { text: '❌ Gagal ambil data group.' }, { quoted: raw });

        const created = groupMetadata.creation
            ? new Date(groupMetadata.creation * 1000).toLocaleDateString('id-ID')
            : '-';

        const ephemeral = groupMetadata.ephemeralDuration
            ? `${Math.round(groupMetadata.ephemeralDuration / 3600)} jam`
            : 'Nonaktif';

        const rows = [
            ['ID', htmlEscape(from)],
            ['Dibuat', htmlEscape(created)],
            ['Member', String(participants.length)],
            ['Admin', String(admins.length)],
            ['Kirim Pesan', groupMetadata.announce ? '🔒 Hanya Admin' : '🔓 Semua Member'],
            ['Edit Info', groupMetadata.restrict ? '🔒 Hanya Admin' : '🔓 Semua Member'],
            ['Tambah Member', groupMetadata.memberAddMode === false ? '🔒 Hanya Admin' : '🔓 Semua Member'],
            ['Sekali Lihat', htmlEscape(ephemeral)],
            ...(groupMetadata.isCommunity ? [['Community', '✅ Ya']] : []),
        ];

        const html = renderInfoCard({
            title: `📋 ${groupMetadata.subject || 'Group'}`,
            subtitle: groupMetadata.desc ? groupMetadata.desc.slice(0, 140) : 'Group Info',
            rows,
        });

        await sendInlineWebUI(sock, from, html, 'Info Group');
    });

