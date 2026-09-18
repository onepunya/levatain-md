import { pick, sleep, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('pilihnama', 'spinnama')
    .in('fun')
    .desc('Randomly pick one name/person from a list (type names or tag people)')
    .prefixOnly()
    .ai({
        trigger: 'User asks the bot to randomly pick one name or person from a list/mentions',
        examples: [
            'pilihacak Andi, Budi, Citra, Dewi',
            'spin Ali,Budi,Caca',
            'pilihnama @Mr one, @Jaki Ganteng, @Rizik',
        ],
        args: { text: 'Comma-separated names, or tag people (can mix)' },
    })
    .run(async (sock, { body, raw, from, mentionedJid, gdb, primaryId }) => {
        const rawText = body.split(' ').slice(1).join(' ').trim();

        if (!rawText) {
            return sock.sendMessage(from, {
                text:
                    `❌ Provide names separated by commas, or tag people.\n\n` +
                    `Example:\n*.pilihnama Andi, Budi, Citra*\n*.pilihnama @orang1, @orang2, @orang3*`,
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
                text: msg('need.names_min2'),
            }, { quoted: raw });
        }

        const mentionsAll = entries.filter(e => e.jid).map(e => e.jid);

        await sock.sendMessage(from, {
            text: `🎯 Randomizing from ${entries.length} names...\n_${entries.map(e => e.label).join(' • ')}_`,
            mentions: mentionsAll,
        }, { quoted: raw });

        await sleep(1200);

        const winner = pick(entries);
        return sock.sendMessage(from, {
            text: `🎉 Picked: *${winner.label}*!`,
            mentions: winner.jid ? [winner.jid] : [],
        }, { quoted: raw });
    });

