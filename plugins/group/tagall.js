import { plugin } from '../../src/core/plugin.js';
export default plugin('tagall', 'hidetag')
  .in('group')
  .desc('Tag semua anggota group')
  .showAllAliases()
  .adminOnly()
  .groupOnly()
  .cooldown(10)
  .ai({
            trigger: 'User minta tag semua member group atau hidetag',
            examples: ['tagall perhatian', 'tag semua anggota'],
            args: { text: 'Pesan yang ingin dikirim' },
        })
  .run(async (sock, { body, raw, from, command, participants }) => {
            const text     = body.split(' ').slice(1).join(' ') || '📢 Perhatian!';
            const mentions = participants.map(p => p.id);

            if (command === 'tagall') {
                const tags = mentions.map(id => `@${id.split('@')[0]}`).join(' ');
                await sock.sendMessage(from, { text: `${text}\n\n${tags}`, mentions }, { quoted: raw });
            } else {
                await sock.sendMessage(from, { text, mentions }, { quoted: raw });
            }
        });

