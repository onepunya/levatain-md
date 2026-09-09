export const meta = {
    cmd:     ['warn', 'unwarn', 'warnlist'],
    tag:     'group',
    aliasOnly: true,
    desc:    'Sistem warn/strike anggota group (auto-kick di warn ke-3)',
    isGroup: true,
    isAdmin: true,
    ai: {
        trigger: 'User minta warn, kasih peringatan, atau cek daftar warn anggota group',
        examples: ['warn @user', 'unwarn @user', 'warnlist'],
    },
};

const MAX_WARN = 3;

export async function run(sock, { raw, from, command, mentionedJid, message, gdb, isBotAdmin, saveDb }) {
    const grp = gdb.groups[from];
    if (!grp.warns) grp.warns = {};

    if (command === 'warnlist') {
        const entries = Object.entries(grp.warns).filter(([, c]) => c > 0);
        if (!entries.length) return sock.sendMessage(from, { text: '✅ Belum ada yang kena warn.' }, { quoted: raw });
        const text = entries.map(([jid, c]) => `• @${jid.split('@')[0]} — ${c}/${MAX_WARN}`).join('\n');
        return sock.sendMessage(from, { text: `*⚠️ DAFTAR WARN*\n\n${text}`, mentions: entries.map(([j]) => j) }, { quoted: raw });
    }

    let target;
    if (message.quoted) {
        const s = message.quoted.sender.replace(/@.*/, '').split(':')[0];
        target  = message.quoted.sender.includes('@lid') ? `${s}@lid` : `${s}@s.whatsapp.net`;
    } else if (mentionedJid?.[0]) {
        target = mentionedJid[0].split(':')[0] + '@s.whatsapp.net';
    }
    if (!target) return sock.sendMessage(from, { text: '❌ Tag atau reply orang yang mau di-warn dulu.' }, { quoted: raw });

    const tag = `@${target.split('@')[0]}`;

    if (command === 'unwarn') {
        grp.warns[target] = Math.max(0, (grp.warns[target] || 0) - 1);
        await saveDb();
        return sock.sendMessage(from, { text: `✅ Warn ${tag} dikurangi. Sekarang: ${grp.warns[target]}/${MAX_WARN}`, mentions: [target] }, { quoted: raw });
    }

    grp.warns[target] = (grp.warns[target] || 0) + 1;
    await saveDb();

    if (grp.warns[target] >= MAX_WARN) {
        grp.warns[target] = 0;
        await saveDb();
        if (!isBotAdmin) {
            return sock.sendMessage(from, { text: `⚠️ ${tag} sudah kena ${MAX_WARN}x warn, tapi bot bukan admin jadi gak bisa kick.`, mentions: [target] }, { quoted: raw });
        }
        await sock.sendMessage(from, { text: `🚫 ${tag} kena ${MAX_WARN}x warn, dikeluarkan dari group.`, mentions: [target] }, { quoted: raw });
        return sock.groupParticipantsUpdate(from, [target], 'remove');
    }

    await sock.sendMessage(from, { text: `⚠️ ${tag} kena warn. Total: ${grp.warns[target]}/${MAX_WARN}`, mentions: [target] }, { quoted: raw });
}
