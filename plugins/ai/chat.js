import { getHistory, clearHistory } from '../../src/ai/memory.js';
import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';

export const meta = {
    interface: {
        cmd:  ['ai', 'tanya'],
        tag:  'ai',
        aliasOnly: true,
        desc: 'Chat langsung dengan AI (dengan memory)',
        ai: {
            trigger: 'User eksplisit minta tanya ke AI, atau minta jawaban dari AI',
            examples: ['tanya AI siapa Einstein', 'ai jelasin fotosintesis'],
        },
        async run(sock, { body, message, raw, from, primaryId }) {
            const { quoted } = message;
            const args = getArgs(body) || quoted?.text;

            if (!args) return sock.sendMessage(from, {
                text: `🤖 Kirim pertanyaanmu!\nContoh: *.ai siapa Einstein?*\n\n💡 Atau langsung ngobrol: *lev [pesanmu]*`
            }, { quoted: raw });

            if (['reset', 'clear', 'forget'].includes(args.toLowerCase().trim())) {
                await clearHistory(primaryId);
                return sock.sendMessage(from, { text: '🗑️ Memory AI direset!' }, { quoted: raw });
            }

            await typing(sock, from);
            try {
                const history = await getHistory(primaryId);
                const response = await api.naga([
                    ...history.slice(-10),
                    { role: 'user', content: args },
                ], `Kamu adalah Levatain, asisten AI yang ramah dan cerdas. Balas dalam bahasa yang sama dengan user.`);

                await sock.sendMessage(from, { text: response }, { quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ ${e.message}` }, { quoted: raw });
            }
        },
    },
};

