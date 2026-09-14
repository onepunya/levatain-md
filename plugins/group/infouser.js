import { sendInlineWebUI } from '../../src/lib/rich-messages.js';
import { renderInfoCard, htmlEscape } from '../../src/lib/webui-templates.js';

function normalizeTarget(raw) {
    const s = raw.split(':')[0];
    if (s.includes('@lid') || s.includes('@s.whatsapp.net')) return s;
    return `${s.replace(/\D/g, '')}@s.whatsapp.net`;
}

export const meta = {
    interface: {
        cmd: ['infouser', 'whois', 'userinfo'],
        tag: 'group',
        aliasOnly: true,
        desc: 'Lihat info user/member',
        ai: {
            trigger: 'User minta info member/user',
            examples: ['infouser @user', 'whois', 'cek profil ini'],
        },
        async run(sock, { raw, from, message, mentionedJid, participants, isGroup, primaryId, gdb, pushname }) {
            let targetId;
            if (message.quoted?.sender) {
                targetId = normalizeTarget(message.quoted.sender);
            } else if (mentionedJid?.[0]) {
                targetId = normalizeTarget(mentionedJid[0]);
            } else {
                targetId = primaryId;
            }

            const targetNum = targetId.replace(/\D/g, '');

            const p = isGroup
                ? participants.find(x =>
                    (x.id          && x.id.replace(/\D/g, '') === targetNum) ||
                    (x.lid         && x.lid.replace(/\D/g, '') === targetNum) ||
                    (x.phoneNumber && x.phoneNumber.replace(/\D/g, '') === targetNum))
                : null;

            const lookupId = p?.phoneNumber || (targetId.includes('@s.whatsapp.net') ? targetId : null) || targetId;
            const userDb   = gdb.users?.[targetId] || gdb.users?.[lookupId] || {};

            let about = '-';
            try {
                const status = await sock.fetchStatus(lookupId);
                about = status?.status || '-';
            } catch {}

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
                ['Chat ke bot', String(userDb.hit || 0)],
                ['Warn', String(userDb.warns || 0)],
                ['Banned', userDb.banned
                    ? `<span class="bad">🚫 Ya (${htmlEscape(userDb.bannedReason || '-')})</span>`
                    : '<span class="ok">✅ Tidak</span>'],
                ['Terakhir chat', htmlEscape(userDb.lastChat ? new Date(userDb.lastChat).toLocaleString('id-ID') : '-')],
            ];

            const html = renderInfoCard({
                title: `👤 ${name}`,
                subtitle: 'User Info',
                rows,
            });

            await sendInlineWebUI(sock, from, html, 'Info User');
        },
    },
};
