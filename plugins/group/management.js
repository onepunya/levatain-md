export const meta = {
    interface: {
        cmd:     ['kick', 'promote', 'demote'],
        tag:     'group',
        aliasOnly: false,
        desc:    'Manajemen anggota group (kick/promote/demote)',
        isGroup: true,
        isAdmin: true,
        ai: {
            trigger: 'User minta kick, promote, atau demote anggota group',
            examples: ['kick @user', 'promote @admin', 'keluarkan user ini'],
        },
        async run(sock, { message, raw, from, command, mentionedJid, participants, isBotAdmin }) {
            if (!isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot harus jadi admin group dulu!' }, { quoted: raw });

            let target;
            if (message.quoted) {
                const s   = message.quoted.sender.replace(/@.*/, '').split(':')[0];
                target    = message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
            } else if (mentionedJid?.[0]) {
                target    = mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
            }

            if (!target) return sock.sendMessage(from, { text: '❌ Tag atau reply anggota dulu.' }, { quoted: raw });

            const targetNum = target.replace(/\D/g, '');
            const found     = participants.find(p =>
                (p.id          && p.id.replace(/\D/g, '') === targetNum) ||
                (p.lid         && p.lid.replace(/\D/g, '') === targetNum) ||
                (p.phoneNumber && p.phoneNumber.replace(/\D/g, '') === targetNum)
            );
            if (!found) return sock.sendMessage(from, { text: '❌ User tidak ada di group ini.' }, { quoted: raw });

            const targetId  = found.id;
            const targetTag = `@${targetId.split('@')[0]}`;

            const actions = {
                kick:    ['remove',  `✅ ${targetTag} dikeluarkan.`],
                promote: ['promote', `✅ ${targetTag} dijadikan admin.`],
                demote:  ['demote',  `✅ ${targetTag} dicopot dari admin.`],
            };

            const [action, msg] = actions[command] || [];
            if (!action) return;

            await sock.groupParticipantsUpdate(from, [targetId], action);
            await sock.sendMessage(from, { text: msg, mentions: [targetId] }, { quoted: raw });
        },
    },
};

