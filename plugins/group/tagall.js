export const meta = {
    cmd:      ['tagall', 'hidetag'],
    tag:      'group',
    aliasOnly: true,
    desc:     'Tag semua anggota group',
    isGroup:  true,
    isAdmin:  true,
    cooldown: 10,
    ai: {
        trigger: 'User minta tag semua member group atau hidetag',
        examples: ['tagall perhatian', 'tag semua anggota'],
        args: { text: 'Pesan yang ingin dikirim' },
    },
};

export async function run(sock, { body, raw, from, command, participants }) {
    const text     = body.split(' ').slice(1).join(' ') || '📢 Perhatian!';
    const mentions = participants.map(p => p.id);

    if (command === 'tagall') {
        const tags = mentions.map(id => `@${id.split('@')[0]}`).join(' ');
        await sock.sendMessage(from, { text: `${text}\n\n${tags}`, mentions }, { quoted: raw });
    } else {
        await sock.sendMessage(from, { text, mentions }, { quoted: raw });
    }
}
