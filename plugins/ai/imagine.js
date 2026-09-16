import { typing, getArgs, api } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('imagine', 'genimg')
    .in('ai')
    .desc('Generate gambar dari deskripsi teks')
    .prefixOnly()
    .ai({
        trigger: 'User minta buat/generate/gambar gambar dari teks, atau minta ilustrasi',
        examples: ['imagine cat astronaut', 'buatkan gambar naga biru'],
        args: { prompt: 'Deskripsi gambar yang ingin dibuat' },
    })
    .run(async (sock, { body, raw, from }) => {
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
    });

