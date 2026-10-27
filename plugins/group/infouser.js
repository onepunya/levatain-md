import { sendInlineWebUI, renderInfoCard, htmlEscape, findParticipant, getAbout } from '../../src/wa/index.js';
import { resolveTarget } from '../../src/core/identity.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('infouser', 'whois', 'userinfo')
    .in('group')
    .desc('View user/member info')
    .prefixOnly()
    .signal('User asks to info member/user', ['infouser @user', 'whois', 'cek profil ini'])
    .run(async (sock, {
        from,
        message,
        mentionedJid,
        participants,
        isGroup,
        primaryId,
        gdb,
        pushname
    }) => {
        const targetId = resolveTarget({ message, mentionedJid })?.id ?? primaryId;
        const p = isGroup ? findParticipant(participants, targetId) : null;

        const lookupId = p?.phoneNumber || (targetId.includes('@s.whatsapp.net') ? targetId : null) || targetId;
        const userDb = gdb.users?.[targetId] || gdb.users?.[lookupId] || {};

        const about = (await getAbout(sock, lookupId)) || '-';

        const roleLabel = p?.admin === 'superadmin' ? '👑 Super Admin'
            : p?.admin === 'admin' ? '🛡️ Admin'
            : isGroup ? '👤 Member' : '-';

        const jidDisplay = p?.phoneNumber || (targetId.includes('@s.whatsapp.net') ? targetId : '-');
        const lidDisplay = p?.lid || (targetId.includes('@lid') ? targetId : userDb.lid || '-');
        const name = userDb.name || pushname || 'User';

        const rows = [
            ['JID', htmlEscape(jidDisplay)],
            ['LID', htmlEscape(lidDisplay)],
            ...(isGroup ? [['Role', htmlEscape(roleLabel)]] : []),
            ['Status/Bio', htmlEscape(about)],
            ['Bot Chats', String(userDb.hit || 0)],
            ['Warn', String(userDb.warns || 0)],
            ['Banned', userDb.banned
                ? `<span class="bad">🚫 Ya (${htmlEscape(userDb.bannedReason || '-')})</span>`
                : '<span class="ok">✅ No</span>'],
            ['Last Chat', htmlEscape(userDb.lastChat ? new Date(userDb.lastChat).toLocaleString('en-US') : '-')],
        ];

        const html = renderInfoCard({
            title: `👤 ${name}`,
            subtitle: 'User Info',
            rows,
        });

        await sendInlineWebUI(sock, from, html, 'User Info');
    });
