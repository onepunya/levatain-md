import { getHistory, getUserMemory, clearHistory } from '../../src/ai/memory.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('memory', 'aiclear')
    .in('ai')
    .desc('View or clear AI memory')
    .showAllAliases()
    .run(async (sock, { body, raw, from, primaryId, pushname }) => {
        const args = body.split(' ').slice(1).join(' ').trim().toLowerCase();

        if (['clear', 'reset', 'hapus', 'delete'].includes(args) || body.toLowerCase().startsWith('aiclear')) {
            await clearHistory(primaryId);
            return sock.sendMessage(from, {
                text: '🗑️ *Memory reset!*\n\nAll chat history deleted. Starting fresh!'
            }, { quoted: raw });
        }

        const history = await getHistory(primaryId);
        const mem     = await getUserMemory(primaryId);
        let text = `🧠 *AI MEMORY — ${pushname}*\n\n`;
        text += `📜 *History:* ${history.length} messages
`;
        if (history.length) {
            const last = history[history.length - 1];
            text += `   └ Terakhir: "${String(last.content).slice(0, 50)}..."\n`;
        }
        text += `\n💡 *What I remember about you:*\n`;
        if (!Object.keys(mem).length) {
            text += `   └ No info stored yet.
`;
        } else {
            for (const [k, v] of Object.entries(mem)) text += `   • ${k}: ${v}\n`;
        }
        text += `\n_Type *.memory clear* to wipe everything._`;

        await sock.sendMessage(from, { text }, { quoted: raw });
    });

