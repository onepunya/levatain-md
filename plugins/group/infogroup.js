import { sendInlineWebUI, renderInfoCard, htmlEscape, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('infogroup', 'ginfo')
    .in('group')
    .desc('View group info')
    .prefixOnly()
    .groupOnly()
    .signal('User asks to info group', ['infogroup', 'ginfo', 'info group'])
    .run(async (sock, { raw, from, groupMetadata, admins, participants, db, primaryId }) => {
        if (!groupMetadata) return sock.sendMessage(from, { text: msg('fail.group') }, { quoted: raw });

        const created = groupMetadata.creation
            ? new Date(groupMetadata.creation * 1000).toLocaleDateString('en-US')
            : '-';

        const ephemeral = groupMetadata.ephemeralDuration
            ? `${Math.round(groupMetadata.ephemeralDuration / 3600)} jam`
            : 'Disabled';

        const rows = [
            ['ID', htmlEscape(from)],
            ['Created', htmlEscape(created)],
            ['Member', String(participants.length)],
            ['Admin', String(admins.length)],
            ['Send Messages', groupMetadata.announce ? '🔒 Only Admin' : '🔓 All Members'],
            ['Edit Info', groupMetadata.restrict ? '🔒 Only Admin' : '🔓 All Members'],
            ['Add Members', groupMetadata.memberAddMode === false ? '🔒 Only Admin' : '🔓 All Members'],
            ['View Once Duration', htmlEscape(ephemeral)],
            ...(groupMetadata.isCommunity ? [['Community', '✅ Yes']] : []),
        ];

        const html = renderInfoCard({
            title: `📋 ${groupMetadata.subject || 'Group'}`,
            subtitle: groupMetadata.desc ? groupMetadata.desc.slice(0, 140) : 'Group Info',
            rows,
        });

        await sendInlineWebUI(sock, from, html, 'Group Info');
    });

