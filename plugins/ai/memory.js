import { getHistory, getUserMemory, clearHistory } from '../../src/ai/memory.js';

export const meta = {
    cmd:  ['memory', 'aiclear'],
    tag:  'ai',
    aliasOnly: true,
    desc: 'Lihat atau hapus memory AI',
};

export async function run(sock, { body, raw, from, primaryId, pushname }) {
    const args = body.split(' ').slice(1).join(' ').trim().toLowerCase();

    if (['clear', 'reset', 'hapus'].includes(args) || body.toLowerCase().startsWith('aiclear')) {
        await clearHistory(primaryId);
        return sock.sendMessage(from, {
            text: '🗑️ *Memory direset!*\n\nSemua riwayat chat dihapus. Mulai fresh!'
        }, { quoted: raw });
    }

    const history = await getHistory(primaryId);
    const mem     = await getUserMemory(primaryId);
    let text = `🧠 *AI MEMORY — ${pushname}*\n\n`;
    text += `📜 *Riwayat:* ${history.length} pesan\n`;
    if (history.length) {
        const last = history[history.length - 1];
        text += `   └ Terakhir: "${String(last.content).slice(0, 50)}..."\n`;
    }
    text += `\n💡 *Yang kuingat tentang kamu:*\n`;
    if (!Object.keys(mem).length) {
        text += `   └ Belum ada info tersimpan.\n`;
    } else {
        for (const [k, v] of Object.entries(mem)) text += `   • ${k}: ${v}\n`;
    }
    text += `\n_Ketik *.memory clear* untuk hapus semua._`;

    await sock.sendMessage(from, { text }, { quoted: raw });
}
