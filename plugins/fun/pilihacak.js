export const meta = {
    cmd:  ['pilihnama', 'spinnama'],
    tag:  'fun',
    aliasOnly: true,
    desc: 'Acak satu nama/orang dari daftar yang dikasih (ketik nama atau tag @orangnya)',
    ai: {
        trigger: 'User minta bot mengacak/memilih satu nama atau satu orang dari beberapa nama/mention yang dikasih',
        examples: [
            'pilihacak Andi, Budi, Citra, Dewi',
            'spin Ali,Budi,Caca',
            'pilihnama @Mr one, @Jaki Ganteng, @Rizik',
        ],
        args: { text: 'Daftar nama dipisah koma, atau tag @orangnya (bisa campur)' },
    },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function run(sock, { body, raw, from, mentionedJid, gdb }) {
    const rawText = body.split(' ').slice(1).join(' ').trim();

    if (!rawText) {
        return sock.sendMessage(from, {
            text:
                `❌ Kasih dulu daftar namanya, dipisah koma, atau tag orangnya.\n\n` +
                `Contoh:\n*.pilihnama Andi, Budi, Citra*\n*.pilihnama @orang1, @orang2, @orang3*`,
        }, { quoted: raw });
    }

    const nameOf = (jid) => {
        const clean = jid.split(':')[0];
        return gdb?.users?.[clean]?.name || `+${clean.split('@')[0]}`;
    };

    const mentionQueue = [...(mentionedJid || [])];
    const seen = new Set();
    const entries = [];

    for (let part of rawText.split(',')) {
        part = part.trim();
        if (!part) continue;

        if (part.startsWith('@')) {
            const jid = mentionQueue.shift();
            if (!jid) continue;
            const cleanJid = jid.includes('@') ? jid.split(':')[0] : `${jid.split(':')[0]}@s.whatsapp.net`;
            if (seen.has(cleanJid)) continue;
            seen.add(cleanJid);
            entries.push({ label: nameOf(cleanJid), jid: cleanJid });
        } else {
            const key = `text:${part.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push({ label: part, jid: null });
        }
    }

    if (entries.length < 2) {
        return sock.sendMessage(from, {
            text: '❌ Minimal kasih 2 nama/orang beda yang mau diacak ya.',
        }, { quoted: raw });
    }

    const mentionsAll = entries.filter(e => e.jid).map(e => e.jid);

    await sock.sendMessage(from, {
        text: `🎯 Mengacak dari ${entries.length} nama...\n_${entries.map(e => e.label).join(' • ')}_`,
        mentions: mentionsAll,
    }, { quoted: raw });

    await new Promise(r => setTimeout(r, 1200));

    const winner = pick(entries);
    return sock.sendMessage(from, {
        text: `🎉 Yang kena: *${winner.label}*!`,
        mentions: winner.jid ? [winner.jid] : [],
    }, { quoted: raw });
}
