import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';

export const meta = {
    cmd:  ['imagine', 'genimg'],
    tag:  'ai',
    aliasOnly: true,
    desc: 'Generate gambar dari deskripsi teks',
    ai: {
        trigger: 'User minta buat/generate/gambar gambar dari teks, atau minta ilustrasi',
        examples: ['imagine cat astronaut', 'buatkan gambar naga biru'],
        args: { prompt: 'Deskripsi gambar yang ingin dibuat' },
    },
};

export async function run(sock, { body, raw, from }) {
    const prompt = getArgs(body);
    if (!prompt) return sock.sendMessage(from, {
        text: '❌ Masukkan prompt!\nContoh: *.imagine naga biru di langit malam*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: `🎨 Generating *${prompt}*...` }, { quoted: raw });

    try {
        const url = await api.imagine(prompt);
        await sock.sendMessage(from, { image: url, caption: `🎨 *${prompt}*` }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
