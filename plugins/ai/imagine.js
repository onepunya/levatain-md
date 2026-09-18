import { typing, getArgs, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('imagine', 'genimg')
    .in('ai')
    .desc('Generate an image from a text description')
    .prefixOnly()
    .ai({
        trigger: 'User asks to generate an image from text or wants an illustration',
        examples: ['imagine cat astronaut', 'buatkan gambar naga biru'],
        args: { prompt: 'Description of the image to generate' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const prompt = getArgs(body);
        if (!prompt) return sock.sendMessage(from, {
            text: msg('need.imagine')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.generating', { prompt }) }, { quoted: raw });

        try {
            const url = await api.imagine(prompt);
            await sock.sendMessage(from, { image: url, caption: `🎨 *${prompt}*` }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

