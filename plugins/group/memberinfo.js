export const meta = {
    interface: {
        cmd:  ['memberinfo', 'userinfo', 'whois'],
        tag:  'group',
        aliasOnly: true,
        desc: 'Lihat info user/member (nama, JID, LID, role, statistik bot)',
        ai: {
            trigger: 'User minta info member, cek profil user, whois, atau data user tertentu',
            examples: ['userinfo @user', 'whois', 'cek profil orang ini'],
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

            const text = `*👤 INFO USER*\n\n`
                + `*Nama:* ${userDb.name || pushname || '-'}\n`
                + `*JID:* ${jidDisplay}\n`
                + `*LID:* ${lidDisplay}\n`
                + (isGroup ? `*Role:* ${roleLabel}\n` : '')
                + `*Status/Bio:* ${about}\n`
                + `*Total chat ke bot:* ${userDb.hit || 0}\n`
                + `*Warn:* ${userDb.warns || 0}\n`
                + `*Banned:* ${userDb.banned ? `🚫 Ya (${userDb.bannedReason || '-'})` : '✅ Tidak'}\n`
                + `*Terakhir chat:* ${userDb.lastChat ? new Date(userDb.lastChat).toLocaleString('id-ID') : '-'}`;

            await sock.sendMessage(from, { text, mentions: [targetId] }, { quoted: raw });
        },
    },
};

function normalizeTarget(raw) {
    const s = raw.split(':')[0];
    if (s.includes('@lid') || s.includes('@s.whatsapp.net')) return s;
    return `${s.replace(/\D/g, '')}@s.whatsapp.net`;
}

