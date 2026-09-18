import { plugin } from '../../src/core/plugin.js';
export default plugin('tagall', 'hidetag')
    .in('group')
    .desc('Tag all group members')
    .showAllAliases()
    .adminOnly()
    .groupOnly()
    .cooldown(10)
    .ai({
        trigger: 'User asks to tag all group members or hidetag',
        examples: ['tagall attention', 'tag all members'],
        args: { text: 'Message to send' },
    })
    .run(async (sock, { body, raw, from, command, participants }) => {
        const text     = body.split(' ').slice(1).join(' ') || '📢 Attention!';
        const mentions = participants.map(p => p.id);

        if (command === 'tagall') {
            const tags = mentions.map(id => `@${id.split('@')[0]}`).join(' ');
            await sock.sendMessage(from, { text: `${text}\n\n${tags}`, mentions }, { quoted: raw });
        } else {
            await sock.sendMessage(from, { text, mentions }, { quoted: raw });
        }
    });

